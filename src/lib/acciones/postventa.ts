"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { anioLima } from "@/lib/periodo";
import { requerirPerfil } from "@/lib/auth";
import { duenoDelExpediente, esRechazoDeRls, mensajeExpedienteAjeno } from "@/lib/expediente-ajeno";
import { notificar, notificarAlmacen } from "@/lib/notificaciones";
import { bloquesPedido, evaluarPagoParaDespacho, puedeVerPrecios, textoCondicionPago, type ServicioPostventa } from "@/lib/postventa";

/**
 * Las acciones del circuito de postventa (migración 0087).
 *
 * Cada una marca UN paso y deja quién y cuándo. Es a propósito: un ✓ sin autor
 * no le sirve a nadie tres meses después, que es justo cuando el cliente llama
 * a reclamar. Ninguna pide más datos de los que el paso necesita — la regla del
 * proyecto sigue siendo que registrar algo tome menos de quince segundos.
 */

function ok() {
  revalidatePath("/postventa");
  revalidatePath("/postventa/agenda");
  revalidatePath("/central/cierres");
  return { error: null as string | null };
}

function falla(mensaje: string) {
  return { error: mensaje };
}

/**
 * EL ERROR DE POSTGRES NO SE LE MUESTRA AL ALMACÉN.
 *
 * El 22-09 el almacén escribió la serie de la lavadora de Ecolav y la pantalla
 * le contestó «there is no unique or exclusion constraint matching the ON
 * CONFLICT specification»: en inglés, sobre índices, y sin decir qué hacer.
 * Era un error nuestro (0268), pero cualquier otro fallo de la base va a
 * llegar igual de crudo. Acá se traduce a algo accionable; si no se reconoce,
 * al menos se dice a quién avisar y se deja el original entre paréntesis para
 * poder buscarlo.
 */
function enCastellano(mensaje: string): string {
  const m = mensaje.replace(/^[A-Z0-9]{5}:\s*/, "");
  if (/duplicate key|ya existe|unique constraint/i.test(m)) {
    return "Esa serie ya está registrada en otra máquina del parque. Revísela en la placa; si es la correcta, avise a operaciones.";
  }
  if (/ON CONFLICT|constraint|violates|null value|invalid input/i.test(m)) {
    return `No se pudo guardar por una falla del sistema, no por lo que escribió. Avise a operaciones (${m.slice(0, 120)}).`;
  }
  return m;
}

// ── Central: los dos checks que liberan el pedido ──────────────────────────

export async function liberarPedido(datos: {
  informeId: string;
  numeroPedido?: string | null;
  marcarPedido?: boolean;
  marcarLiquidacion?: boolean;
  /** Código de gerencia u operaciones para ejecutar con la liquidación pendiente (0237). */
  pin?: string | null;
}) {
  // Carlos, 02-09, marcando el pedido de Sierra Travel: «yo pensaría que me
  // obligues más bien a poner el número del pedido». Es lo que después
  // permite cruzarlo con el ERP cuando alguien pregunta por él.
  if (datos.marcarPedido && !datos.numeroPedido?.trim()) {
    return falla("Anote el número con que quedó el pedido en el ERP: sin ese número no se marca como ejecutado");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("liberar_pedido_postventa", {
    p_informe_id: datos.informeId,
    p_numero_pedido: datos.numeroPedido?.trim() || null,
    p_marcar_pedido: datos.marcarPedido ?? false,
    p_marcar_liquidacion: datos.marcarLiquidacion ?? false,
    p_pin: datos.pin?.trim() || null,
  });
  if (error) return falla(error.message);

  // Con los dos checks el pedido queda visible para postventa. La campana suena
  // una sola vez, cuando de verdad hay algo que hacer: si sonara con el primer
  // check, postventa abriría un pedido que todavía no puede trabajar.
  const { data: servicio } = await supabase
    .from("servicios_postventa")
    .select("id, cliente_texto, pedido_ejecutado_at, liquidacion_at, aprobado_at")
    .eq("id", data as string)
    .single();

  if (servicio?.pedido_ejecutado_at && servicio?.liquidacion_at && !servicio?.aprobado_at) {
    // Cuántas máquinas ya tienen serie (Carlos, 22-09: la lista la siembra la
    // propia liberación, 0270) — para que postventa sepa de entrada si el
    // pedido está completo o si hay algo esperando stock.
    const { data: equipos } = await supabase
      .from("pedido_equipos")
      .select("serie")
      .eq("servicio_id", servicio.id);
    const total = equipos?.length ?? 0;
    const conSerie = (equipos ?? []).filter((e) => e.serie).length;
    const resumenEquipos =
      total > 1 ? ` · ${total} equipos: ${conSerie} con serie, ${total - conSerie} sin stock` : total === 1 && !conSerie ? " · sin serie todavía" : "";

    const { data: postventa } = await supabase
      .from("perfiles")
      .select("id")
      .eq("es_postventa", true)
      .eq("activo", true);
    await Promise.all(
      (postventa ?? []).map((p) =>
        notificar({
          userId: p.id,
          tipo: "lead_asignado",
          titulo: "Nuevo pedido para despachar",
          cuerpo: `${servicio.cliente_texto ?? "Central liberó un pedido"}${resumenEquipos}`,
          url: `/postventa/pedidos/${servicio.id}`,
        }),
      ),
    );
  }
  return ok();
}

// ── Postventa: el acuse ────────────────────────────────────────────────────

export async function aprobarPedido(servicioId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("aprobar_pedido_postventa", { p_servicio_id: servicioId });
  if (error) return falla(error.message);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return ok();
}

// ── Los pasos del pedido ───────────────────────────────────────────────────

type CampoPaso =
  | "prueba_solicitada_at"
  | "prueba_lista_at"
  | "plano_enviado_at"
  | "preinstalacion_ok_at"
  | "pago_confirmado_at";

/** Marca un paso simple con la hora actual y el autor cuando corresponde. */
export async function marcarPaso(servicioId: string, campo: CampoPaso, nota?: string) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const cambios: Record<string, unknown> = { [campo]: new Date().toISOString() };
  if (campo === "prueba_lista_at") {
    cambios.prueba_lista_por = perfil.id;
    if (nota) cambios.protocolo_prueba_ref = nota.trim();
    // La fila importada del Excel usa texto: se deja coherente para que la
    // agenda vieja y la nueva digan lo mismo.
    cambios.prueba_embalaje = "SI";
  }
  if (campo === "plano_enviado_at") cambios.planos_preinstalacion = "SI";
  if (campo === "preinstalacion_ok_at" && nota) cambios.preinstalacion_nota = nota.trim();
  if (campo === "pago_confirmado_at") {
    cambios.pago_confirmado_por = perfil.id;
    cambios.confirmacion_abono = "SI";
  }

  const { error } = await supabase.from("servicios_postventa").update(cambios).eq("id", servicioId);
  if (error) return falla(error.message);
  // «Prueba la máquina»: el almacén se entera en su bandeja (0246).
  if (campo === "prueba_solicitada_at") {
    const { data: s } = await supabase.from("servicios_postventa").select("cliente_texto, equipo, es_prueba").eq("id", servicioId).maybeSingle();
    await notificarAlmacen({
      titulo: `Probar y embalar · ${(s?.cliente_texto ?? "").replace(/^\d{8,11}\s*-\s*/, "")}`,
      cuerpo: `${s?.equipo ?? ""}. Postventa pide la prueba; al terminar, suba el protocolo y márquelo.`.trim(),
      url: `/almacen/pedidos/${servicioId}`,
      esPrueba: s?.es_prueba === true,
    });
  }
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return ok();
}

/** Finanzas (o Central mientras no tenga usuario) confirma cuánto entró. */
export async function confirmarPago(servicioId: string, montoPagado: number) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase
    .from("servicios_postventa")
    .update({
      monto_pagado: montoPagado,
      pago_confirmado_at: new Date().toISOString(),
      pago_confirmado_por: perfil.id,
      confirmacion_abono: "SI",
    })
    .eq("id", servicioId);
  if (error) return falla(error.message);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return ok();
}

/**
 * El pedido quedó cobrado del todo, dicho por quien no ve las cifras.
 *
 * Postventa no puede tipear cuánto entró —no ve el total (Carlos, 27-08)— así
 * que su única confirmación posible es «ya está cobrado». El monto lo pone el
 * servidor leyéndolo de la fila: la cifra nunca pasa por el navegador, ni de
 * ida ni de vuelta.
 */
export async function confirmarPagoCompleto(servicioId: string) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data: fila } = await supabase
    .from("servicios_postventa")
    .select("monto")
    .eq("id", servicioId)
    .single();
  if (!fila) return falla("No se encontró el pedido");

  const { error } = await supabase
    .from("servicios_postventa")
    .update({
      // Sin monto cargado (las filas viejas del Excel) no hay cifra que
      // igualar: alcanza con la marca y la fecha, que es lo que destraba el
      // paso. Inventar un 0 diría «cobró cero», que es otra cosa.
      ...(fila.monto != null ? { monto_pagado: fila.monto } : {}),
      pago_confirmado_at: new Date().toISOString(),
      pago_confirmado_por: perfil.id,
      confirmacion_abono: "SI",
    })
    .eq("id", servicioId);
  if (error) return falla(error.message);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return ok();
}

/**
 * Finanzas confirmó el pago — y quedó escrito QUIÉN y POR DÓNDE.
 *
 * Carlos, 01-09: «le envío un mensaje a Finanzas, por correo: confírmame el
 * pago, porque yo no tengo acceso». Finanzas no tiene usuario en el CRM
 * todavía, así que la confirmación la registra postventa con lo que Finanzas
 * le contestó. Por eso el nombre y el medio son obligatorios: un check sin
 * eso no defiende a nadie cuando el voucher era falso («tipo falso Yape, pero
 * con vouchers»). Con precios a la vista se puede decir cuánto entró; sin
 * ellos, solo si está cobrado del todo o parcial.
 */
export async function confirmarPagoFinanzas(
  servicioId: string,
  datos: {
    quien: string;
    medio: string;
    montoPagado?: number | null;
    completo?: boolean;
    /** «Entró el adelanto acordado»: el servidor pone la cifra desde la condición (0232). */
    adelanto?: boolean;
    nota?: string;
    capturaPath?: string | null;
  },
) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  // Carlos, 02-09: la captura del correo o del WhatsApp vale como
  // confirmación (0157). Sin captura, hace falta quién y por dónde.
  const captura = datos.capturaPath?.trim() || null;
  if (captura && !/^finanzas\/[0-9a-f-]{36}\/[^/]+$/i.test(captura)) return falla("La captura no tiene una ruta válida");
  if (!captura) {
    if (!datos.quien.trim()) return falla("Escriba quién de Finanzas confirmó el pago, o suba la captura");
    if (!datos.medio.trim()) return falla("Diga por dónde lo confirmó: correo, WhatsApp o llamada, o suba la captura");
  }

  const { data: fila } = await supabase
    .from("servicios_postventa")
    .select("monto, pct_antes_despacho")
    .eq("id", servicioId)
    .single();
  if (!fila) return falla("No se encontró el pedido");
  // Con el adelanto acordado, la cifra la pone el servidor: quien no ve
  // precios no adivina, y el pedido no queda «confirmado» con pagado 0 (que
  // fue lo que trabó la salida del 495-26 el 14-09).
  if (datos.adelanto) {
    if (fila.pct_antes_despacho == null) return falla("Este pedido no tiene condición de pago cargada. Pídale a operaciones o gerencia que la defina desde el pedido, y vuelva a registrar la confirmación.");
    if (fila.monto == null) return falla("Este pedido no tiene monto cargado: registre la confirmación como cobrado del todo o parcial.");
  }

  const detalle = [
    datos.adelanto && fila.pct_antes_despacho != null ? `entró el adelanto acordado (${Number(fila.pct_antes_despacho)} %)` : null,
    datos.quien.trim() ? `${datos.quien.trim()} (Finanzas)${datos.medio.trim() ? `, por ${datos.medio.trim()}` : ""}` : null,
    captura ? "captura adjunta" : null,
    datos.nota?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
  const cambios: Record<string, unknown> = {
    pago_confirmado_at: new Date().toISOString(),
    pago_confirmado_por: perfil.id,
    pago_confirmado_detalle: detalle,
    pago_confirmado_captura: captura,
    confirmacion_abono: "SI",
  };
  if (datos.montoPagado != null && Number.isFinite(datos.montoPagado)) cambios.monto_pagado = datos.montoPagado;
  else if (datos.completo && fila.monto != null) cambios.monto_pagado = fila.monto;
  else if (datos.adelanto && fila.monto != null && fila.pct_antes_despacho != null)
    cambios.monto_pagado = Number(((Number(fila.monto) * Number(fila.pct_antes_despacho)) / 100).toFixed(2));

  const { error } = await supabase.from("servicios_postventa").update(cambios).eq("id", servicioId);
  if (error) return falla(error.message);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath("/postventa/control");
  return ok();
}

/**
 * La APERTURA DE DESPACHO: el acto con el que almacén despacha sin preguntar.
 *
 * «Para que se despache el equipo generamos un formato que le llamamos
 * apertura (…) la condicional es: Finanzas aprobó, check; corroboraste tu
 * dirección, check; pedido embalado, check; plano, check. Despacho.» Las
 * condiciones se vuelven a verificar ACÁ, no solo en la pantalla: el
 * documento impreso dice que todo estaba cumplido, y eso tiene que ser
 * verdad. Emitirla dos veces no la duplica: vuelve a abrir la misma.
 */
export async function emitirAperturaDespacho(servicioId: string) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase.from("servicios_postventa").select("*").eq("id", servicioId).single();
  if (!data) return falla("No se encontró el pedido");
  const s = data as unknown as ServicioPostventa;
  if (s.apertura_despacho_at) return ok();

  const trabado = bloquesPedido(s)
    .flatMap((b) => b.pasos)
    .find((p) => p.clave === "apertura")?.trabado;
  if (trabado) return falla(trabado);

  const { error } = await supabase
    .from("servicios_postventa")
    .update({ apertura_despacho_at: new Date().toISOString(), apertura_despacho_por: perfil.id })
    .eq("id", servicioId);
  if (error) return falla(error.message);
  // «Que me lleguen las aperturas» (Lesly, 16-09; 0246).
  await notificarAlmacen({
    titulo: `Apertura de despacho · ${(s.cliente_texto ?? "").replace(/^\d{8,11}\s*-\s*/, "")}`,
    cuerpo: `${s.equipo ?? ""}${s.fecha_despacho ? ` · programado para el ${s.fecha_despacho}` : " · falta programar el día"}. Con esto el almacén despacha sin preguntar.`,
    url: `/almacen/pedidos/${servicioId}`,
    esPrueba: s.es_prueba === true,
  });
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath("/postventa/control");
  return ok();
}

/**
 * La dirección, confirmada por teléfono con el cliente — y quién recibe.
 *
 * Se guarda con quién la confirmó porque el error de dirección es el clásico
 * del área —«no, yo no le he dado eso a la señorita»— y cuando vuelve a pasar,
 * lo primero que hay que poder decir es con quién se habló. Carlos (01-09):
 * en esa llamada «casi el 90 % de veces» cambia la dirección, el teléfono o
 * la persona que recibe; por eso quien recibe se toma acá y no recién al
 * despachar.
 */
/**
 * DESPUÉS DE LA APERTURA, TOCAR LA ENTREGA PIDE CÓDIGO (Carlos, 21-09): «no
 * debería permitir modificar una vez que se guarda… con PIN, exactamente».
 * La apertura ya salió al almacén y al cliente; cambiar dirección, quién
 * recibe o la fecha después de eso se autoriza, no se edita.
 */
async function candadoDeApertura(servicioId: string, pin?: string | null): Promise<{ error: string | null; pidePin?: boolean }> {
  const supabase = await createClient();
  const { data: s } = await supabase.from("servicios_postventa").select("apertura_despacho_at").eq("id", servicioId).maybeSingle();
  if (!s?.apertura_despacho_at) return { error: null };
  if (!pin?.trim()) return { error: "La apertura ya se emitió: para cambiar esto hace falta el código de operaciones o gerencia", pidePin: true };
  const { error } = await supabase.rpc("validar_codigo_autorizacion", { p_pin: pin.trim(), p_ambito: "operaciones" });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, ""), pidePin: true };
  return { error: null };
}

export async function verificarDireccion(
  servicioId: string,
  datos: {
    direccion: string;
    confirmoNombre: string;
    recibeNombre?: string;
    recibeDoc?: string;
    recibeTelefono?: string;
    /** A domicilio o en agencia, y cuál (0259). */
    entregaModo?: "domicilio" | "agencia" | null;
    agenciaDestino?: string | null;
    pin?: string | null;
  },
) {
  const supabase = await createClient();
  if (!datos.direccion.trim()) return falla("Escriba la dirección tal como la confirmó el cliente");
  // El DNI de quien recibe es obligatorio (Lesly, 21-09: «tiene que ser obligatorio»).
  if (!datos.recibeDoc?.trim() || datos.recibeDoc.replace(/\D/g, "").length < 8) return falla("El DNI de quien recibe es obligatorio (8 dígitos): sin él la agencia no entrega");
  if (datos.entregaModo === "agencia" && !datos.agenciaDestino?.trim()) return falla("Diga en qué agencia y a qué ciudad (ej. «Marvisur, agencia Trujillo»): en Cusco hay seis");
  const candado = await candadoDeApertura(servicioId, datos.pin);
  if (candado.error) return { error: candado.error, pidePin: candado.pidePin };

  const { error } = await supabase
    .from("servicios_postventa")
    .update({
      direccion_entrega: datos.direccion.trim(),
      direccion_verificada_at: new Date().toISOString(),
      direccion_verificada_con: datos.confirmoNombre.trim() || null,
      ...(datos.recibeNombre?.trim() ? { recibe_nombre: datos.recibeNombre.trim() } : {}),
      recibe_doc: datos.recibeDoc.trim(),
      ...(datos.recibeTelefono?.trim() ? { recibe_telefono: datos.recibeTelefono.trim() } : {}),
      ...(datos.entregaModo ? { entrega_modo: datos.entregaModo, agencia_destino: datos.entregaModo === "agencia" ? datos.agenciaDestino?.trim() || null : null } : {}),
    })
    .eq("id", servicioId);
  if (error) return falla(error.message);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}/apertura`);
  return ok();
}

/** Este pedido no lleva plano de preinstalación (0259): el paso se salta y queda el motivo. */
export async function marcarSinPlano(servicioId: string, motivo: string) {
  if (!motivo.trim()) return falla("Diga por qué no lleva plano (ej. «es un calderín, no requiere instalación»)");
  const supabase = await createClient();
  const { error } = await supabase.from("servicios_postventa").update({ sin_plano: true, sin_plano_motivo: motivo.trim() }).eq("id", servicioId);
  if (error) return falla(error.message);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return ok();
}

export async function programarDespacho(servicioId: string, fecha: string, hora?: string | null, nota?: string, pin?: string | null) {
  const supabase = await createClient();
  const candado = await candadoDeApertura(servicioId, pin);
  if (candado.error) return { error: candado.error, pidePin: candado.pidePin };
  // Con hora (Carlos, 22-09: «solamente falta ponerle hora»): así ocupa su
  // franja en el calendario y el almacén sabe a qué hora preparar la carga.
  const horaLimpia = hora && /^\d{2}:\d{2}/.test(hora) ? hora.slice(0, 5) : null;
  const { error } = await supabase
    .from("servicios_postventa")
    .update({ fecha_despacho: fecha || null, despacho_hora: horaLimpia, despacho_nota: nota?.trim() || null })
    .eq("id", servicioId);
  if (error) return falla(error.message);
  // «Recepcionas almacén que hay una programación de despacho para mañana,
  // para que estés lista: de repente tengo que contratar un montacarga»
  // (Carlos, 16-09; 0246).
  let aviso: string | undefined;
  if (fecha) {
    const { data: s } = await supabase.from("servicios_postventa").select("*").eq("id", servicioId).maybeSingle();
    await notificarAlmacen({
      titulo: `Despacho programado para el ${fecha}${horaLimpia ? ` a las ${horaLimpia}` : ""} · ${(s?.cliente_texto ?? "").replace(/^\d{8,11}\s*-\s*/, "")}`,
      cuerpo: `${s?.equipo ?? ""}${nota?.trim() ? ` · ${nota.trim()}` : ""}. Confirme en su pedido cuando esté listo.`,
      url: `/almacen/pedidos/${servicioId}`,
      esPrueba: s?.es_prueba === true,
    });
    // EL DOBLE FILTRO (Carlos, 22-09): programar no bloquea —«todo lo
    // programamos unilateralmente»—, pero si la apertura todavía no se puede
    // emitir, se avisa de una vez: es lo que el almacén va a ver en rojo.
    if (s && !s.apertura_despacho_at) {
      const trabado = bloquesPedido(s as unknown as ServicioPostventa)
        .flatMap((b) => b.pasos)
        .find((p) => p.clave === "apertura")?.trabado;
      if (trabado) aviso = `El almacén lo va a ver en rojo hasta que emita la apertura: falta ${trabado}.`;
    }
  }
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return { ...ok(), aviso };
}

/**
 * El despacho, ya ejecutado. Acá arranca la garantía cuando va a provincia.
 *
 * Si queda saldo, no se marca sin decir quién lo autorizó: es la regla que hoy
 * vive en la cabeza de una persona y que conviene que viva en el sistema.
 */
export async function registrarDespacho(
  servicioId: string,
  datos: {
    fecha: string;
    transportista?: string;
    guia?: string;
    recibeNombre?: string;
    recibeDoc?: string;
    recibeTelefono?: string;
    motivoSinCancelar?: string;
  },
) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const { data: servicio } = await supabase
    .from("servicios_postventa")
    .select("monto, monto_pagado, moneda, informe_cierre_id, pago_confirmado_at, confirmacion_abono, pct_antes_despacho, credito_dias, apertura_despacho_at, tipo_pedido, entrega_en")
    .eq("id", servicioId)
    .single();
  if (!servicio) return falla("No se encontró el pedido");

  // SIN APERTURA NO SALE NADA (0274). La pantalla ya escondía el botón, pero
  // el servidor no lo revisaba: la misma condición que el botón —pedido del
  // cierre en el CRM, sin apertura, y que no sea un repuesto que el cliente
  // recoge en planta—. Carlos, 22-09: «no debería permitirte despachar… si es
  // que no ha cumplido los otros pasos».
  const recogeEnPlanta = servicio.tipo_pedido === "repuesto" && servicio.entrega_en === "planta";
  if (servicio.informe_cierre_id && !servicio.apertura_despacho_at && !recogeEnPlanta) {
    return falla("Sin apertura de despacho no sale nada del almacén. Emita la apertura del pedido y después registre la salida.");
  }

  // LA CONDICIÓN DE PAGO MANDA (0232). Se compara lo pagado con lo que el
  // informe exige ANTES del despacho, no con el total: con «50 % adelanto +
  // 50 % crédito» y el adelanto confirmado, la salida no pide permiso. La
  // autorización con nombre y motivo queda para cuando se despacha con menos
  // de lo acordado. Las filas del Excel sin cifras siguen sin trabarse.
  const pago = evaluarPagoParaDespacho(servicio);
  if (!pago.cubierto && !datos.motivoSinCancelar?.trim()) {
    const moneda = servicio.moneda ?? "USD";
    const cifras = puedeVerPrecios(perfil)
      ? ` (${moneda} ${pago.requerido.toLocaleString("es-PE")}; Finanzas confirmó ${moneda} ${pago.pagado.toLocaleString("es-PE")})`
      : "";
    const condicion = textoCondicionPago(servicio);
    return falla(
      condicion
        ? `La condición de pago es «${condicion}» y lo confirmado por Finanzas no cubre lo acordado antes del despacho${cifras}. Para despachar igual, indique quién lo autorizó y por qué.`
        : `Este pedido no tiene condición de pago cargada, así que se exige el pago completo antes de despachar${cifras}. Pídale a operaciones o gerencia que defina la condición desde el pedido, o indique quién autorizó despachar así y por qué.`,
    );
  }

  const { error } = await supabase
    .from("servicios_postventa")
    .update({
      despachado_at: `${datos.fecha}T12:00:00-05:00`,
      fecha_despacho: datos.fecha,
      transportista: datos.transportista?.trim() || null,
      guia: datos.guia?.trim() || null,
      recibe_nombre: datos.recibeNombre?.trim() || null,
      recibe_doc: datos.recibeDoc?.trim() || null,
      recibe_telefono: datos.recibeTelefono?.trim() || null,
      despacho_sin_cancelar_motivo: datos.motivoSinCancelar?.trim() || null,
      despacho_autorizado_por: datos.motivoSinCancelar?.trim() ? perfil.id : null,
    })
    .eq("id", servicioId);
  if (error) return falla(error.message);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return ok();
}

/**
 * Cierra el pedido y sube el equipo al parque instalado.
 *
 * Es el paso que hoy no existe y que cambia el trabajo del área: a partir de
 * acá la máquina tiene ficha propia, garantía con fecha de vencimiento y un
 * mantenimiento agendado. Postventa deja de esperar la llamada del cliente.
 */
export async function cerrarPedido(
  servicioId: string,
  datos: { series?: string[]; garantiaMeses?: number; mesesMantenimiento?: number },
) {
  const supabase = await createClient();

  const { data: s } = await supabase
    .from("servicios_postventa")
    .select(
      "id, cuenta_id, cliente_texto, equipo, ubicacion, fecha_confirmacion, fecha_despacho, despachado_at, puesta_en_marcha, guia, informe_cierre_id",
    )
    .eq("id", servicioId)
    .single();
  if (!s) return falla("No se encontró el pedido");

  const series = (datos.series ?? []).map((x) => x.trim()).filter(Boolean);
  const garantia = datos.garantiaMeses ?? 24;
  const mantenimiento = datos.mesesMantenimiento ?? 6;

  // Sin serie no hay equipo en el parque: la serie ES la identidad de la
  // máquina. Se puede cerrar igual —hay pedidos históricos sin serie a la
  // vista— pero entonces no se crea la ficha, y eso queda dicho en la pantalla.
  //
  // El alta va por `subir_maquina_al_parque` (0274) y NO por un upsert: el
  // único de la serie es por expresión (upper(btrim(serie))) y el
  // `onConflict: "serie"` de antes fallaba siempre sin que nadie lo viera —los
  // 4 pedidos cerrados en septiembre quedaron con 0 máquinas en el parque—.
  // Si una serie no entra, el pedido NO se cierra: mejor que postventa vea el
  // error a que la pantalla diga que la máquina ya tiene garantía cuando no.
  for (const serie of series) {
    const { error: eParque } = await supabase.rpc("subir_maquina_al_parque", {
      p_servicio: s.id,
      p_serie: serie,
      p_garantia_meses: garantia,
      p_meses_mantenimiento: mantenimiento,
    });
    if (eParque) return falla(`La serie ${serie} no se pudo subir al parque: ${enCastellano(eParque.message)}`);
  }

  const { error } = await supabase
    .from("servicios_postventa")
    .update({ cerrado_at: new Date().toISOString(), completado: true })
    .eq("id", servicioId);
  if (error) return falla(error.message);

  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath("/postventa/equipos");
  return ok();
}

/**
 * CIERRE MASIVO DE LOS PEDIDOS «ANTERIORES AL CIRCUITO» (ítem 10 de la
 * reunión del 22-09): las filas que vinieron del Excel y ya se sabe que se
 * entregaron, pero nadie les tocó el check porque no traen el flujo digital
 * (series, apertura, etc.) que sí tienen los pedidos nacidos en el CRM. Es a
 * propósito más simple que `cerrarPedido`: no sube ningún equipo al parque —
 * esas máquinas, si existen, ya deberían estar cargadas por otra vía — solo
 * marca «entregado y cerrado», con la fecha que Rubí ponga.
 *
 * Nunca toca un pedido del circuito digital (`origen <> 'excel'`) ni uno ya
 * cerrado: es un botón para depurar la cola vieja, no para cerrar cualquier
 * cosa por accidente.
 */
export async function cerrarPedidosAntiguosComoEntregados(
  ids: string[],
  fecha: string,
): Promise<{ error: string | null; cerrados?: number }> {
  await requerirPerfil();
  const supabase = await createClient();

  const lista = [...new Set(ids)].filter(Boolean);
  if (lista.length === 0) return falla("Elija al menos un pedido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return falla("Ponga la fecha en que se entregó");

  const { data, error } = await supabase.rpc("cerrar_pedidos_excel_en_bloque", { p_ids: lista, p_fecha: fecha });
  if (error) return falla(error.message);

  revalidatePath("/postventa/atenciones");
  return { error: null, cerrados: typeof data === "number" ? data : 0 };
}

/**
 * Las series del pedido, sin cerrarlo (0253). Gary Group salió el 15-09 con
 * guía y ninguna serie llegó al parque: el caso que abrió después no tenía
 * máquinas que elegir. La puerta era «Cerrar pedido»; ahora las series se
 * ponen apenas se conocen (la guía, la placa en la salida del almacén).
 */
export async function registrarSeriesDelPedido(servicioId: string, series: string[], garantiaMeses = 24): Promise<{ error: string | null; fichadas?: number }> {
  const limpias = [...new Set(series.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (limpias.length === 0) return { error: "Escriba al menos una serie" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_series_del_pedido", { p_servicio: servicioId, p_series: limpias, p_garantia_meses: garantiaMeses });
  if (error) return falla(error.message);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  revalidatePath("/postventa/equipos");
  return { error: null, fichadas: Number(data ?? 0) };
}

/**
 * LOS EQUIPOS DEL PEDIDO (0260). La lista se siembra desde el cierre la
 * primera vez que alguien abre el pedido; después cada equipo lleva su serie
 * (= hay stock), si va en este despacho y su protocolo del almacén.
 */
export interface EquipoDelPedido {
  id: string;
  orden: number;
  descripcion: string;
  sku: string | null;
  serie: string | null;
  equipo_id: string | null;
  en_este_despacho: boolean;
  prueba_lista_at: string | null;
  protocolo_ref: string | null;
  protocolo_nota: string | null;
  protocolo_fotos: unknown;
}

export async function equiposDelPedido(servicioId: string): Promise<EquipoDelPedido[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pedido_equipos")
    .select("id, orden, descripcion, sku, serie, equipo_id, en_este_despacho, prueba_lista_at, protocolo_ref, protocolo_nota, protocolo_fotos")
    .eq("servicio_id", servicioId)
    .order("orden");
  if (data && data.length > 0) return data as EquipoDelPedido[];
  // Primera vez: se arma desde el cierre (o del texto del pedido si no hay cierre).
  const { error } = await supabase.rpc("sembrar_equipos_del_pedido", { p_servicio: servicioId });
  if (error) return [];
  // La consulta lleva un filtro de más a propósito: Next memoriza los fetch
  // idénticos dentro de un mismo render, y sin esto devolvía la lista vacía
  // de la primera consulta aunque la siembra ya estuviera en la base.
  const { data: sembrados } = await supabase
    .from("pedido_equipos")
    .select("id, orden, descripcion, sku, serie, equipo_id, en_este_despacho, prueba_lista_at, protocolo_ref, protocolo_nota, protocolo_fotos")
    .eq("servicio_id", servicioId)
    .gte("orden", 1)
    .order("orden");
  return (sembrados ?? []) as EquipoDelPedido[];
}

export async function registrarSerieDelEquipo(itemId: string, servicioId: string, serie: string): Promise<{ error: string | null }> {
  if (!serie.trim()) return { error: "Escriba la serie como se lee en la placa" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_serie_del_equipo", { p_item: itemId, p_serie: serie.trim().toUpperCase(), p_garantia_meses: 24 });
  if (error) return falla(enCastellano(error.message));
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  revalidatePath("/postventa/equipos");
  return ok();
}

/** Postventa decide qué va en este despacho (Ecolav: sale la lavadora, la secadora sin stock espera). */
export async function equipoVaEnEsteDespacho(itemId: string, servicioId: string, va: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("equipo_va_en_este_despacho", { p_item: itemId, p_va: va });
  if (error) return falla(error.message);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  return ok();
}

/**
 * El informe de puesta en marcha (anexo 3 del manual), con lo que de verdad
 * sirve después: fotos, ciclos y conformidad del cliente.
 *
 * También deja la fecha en el pedido y actualiza la lectura de ciclos del
 * equipo, que es el dato con el que se defiende una garantía dos años después.
 */
export async function guardarInformeServicio(datos: {
  servicioId?: string | null;
  equipoId?: string | null;
  cuentaId?: string | null;
  clienteTexto?: string | null;
  equipoTexto?: string | null;
  tipo: string;
  modalidad: "in_situ" | "videollamada" | "planta";
  ejecutadoAt: string;
  tecnico?: string | null;
  detalle?: string | null;
  observaciones?: string | null;
  ciclos?: number | null;
  capacitacion?: Record<string, boolean>;
  conformeNombre?: string | null;
  conformeDoc?: string | null;
  asunto?: string | null;
  /** El formato de Lesly (0242): hora de inicio y de culminación, verificación/pruebas, pendiente y repuestos a cotizar. */
  horaInicio?: string | null;
  horaFin?: string | null;
  verificacion?: string | null;
  pendientes?: string | null;
  repuestos?: { codigo?: string; descripcion: string; cantidad?: number | null; precio?: number | null; stock?: string | null }[];
  /**
   * Fotos YA subidas al bucket privado `adjuntos` por el cliente; acá solo se
   * guardan los metadatos, igual que en el registro de gestión. El manual las
   * exige en los cinco formatos —«todo proceso contará con un registro
   * fotográfico que será adjuntado en el informe»— y son lo que Carlos quiere
   * poder mostrar cuando el cliente reclama: «venga el informe, la foto… ahí
   * está la hora y fecha, no hay problema». Máximo 10.
   */
  fotos?: { path: string; nombre: string; tipo: string; tamano: number }[];
  /** Los informes del almacén (0252): qué informe es, de qué atención, y los materiales que faltan. */
  claseAlmacen?: string | null;
  atencionId?: string | null;
  listaMateriales?: { descripcion: string; cantidad?: number | null; costo?: number | null }[];
}) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const anio = anioLima();
  const { data: correlativo } = await supabase.rpc("siguiente_correlativo_informe_servicio", { p_anio: anio });

  const { data: informe, error } = await supabase
    .from("informes_servicio")
    .insert({
      correlativo,
      anio,
      tipo: datos.tipo,
      servicio_id: datos.servicioId ?? null,
      equipo_id: datos.equipoId ?? null,
      cuenta_id: datos.cuentaId ?? null,
      cliente_texto: datos.clienteTexto ?? null,
      equipo_texto: datos.equipoTexto ?? null,
      modalidad: datos.modalidad,
      ejecutado_at: datos.ejecutadoAt,
      tecnico: datos.tecnico?.trim() || null,
      elaborado_por: perfil.id,
      detalle: datos.detalle?.trim() || null,
      observaciones: datos.observaciones?.trim() || null,
      ciclos: datos.ciclos ?? null,
      capacitacion: datos.capacitacion ?? {},
      cliente_conforme_nombre: datos.conformeNombre?.trim() || null,
      cliente_conforme_doc: datos.conformeDoc?.trim() || null,
      asunto: datos.asunto?.trim() || null,
      hora_inicio: datos.horaInicio || null,
      hora_fin: datos.horaFin || null,
      fecha_informe: new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
      verificacion: datos.verificacion?.trim() || null,
      pendientes: datos.pendientes?.trim() || null,
      repuestos: (datos.repuestos ?? [])
        .filter((r) => r.descripcion?.trim())
        .slice(0, 40)
        .map((r) => ({
          codigo: String(r.codigo ?? "").trim().slice(0, 40) || null,
          descripcion: String(r.descripcion).trim().slice(0, 200),
          cantidad: r.cantidad == null || Number.isNaN(Number(r.cantidad)) ? null : Number(r.cantidad),
          precio: r.precio == null || Number.isNaN(Number(r.precio)) ? null : Number(r.precio),
          stock: r.stock ? String(r.stock).trim().slice(0, 40) : null,
        })),
      fotos: (datos.fotos ?? []).slice(0, 10).map((f) => ({
        path: String(f.path).slice(0, 300),
        nombre: String(f.nombre).slice(0, 120),
        tipo: String(f.tipo).slice(0, 100),
        tamano: Number(f.tamano) || 0,
      })),
      clase_almacen: datos.claseAlmacen ?? null,
      atencion_id: datos.atencionId ?? null,
      lista_materiales: (datos.listaMateriales ?? [])
        .filter((m) => m.descripcion?.trim())
        .slice(0, 60)
        .map((m) => ({
          descripcion: String(m.descripcion).trim().slice(0, 200),
          cantidad: m.cantidad == null || Number.isNaN(Number(m.cantidad)) ? null : Number(m.cantidad),
          costo: m.costo == null || Number.isNaN(Number(m.costo)) ? null : Number(m.costo),
        })),
      emitido_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return falla(error.message);

  const fecha = datos.ejecutadoAt.slice(0, 10);

  if (datos.servicioId && datos.tipo === "puesta_en_marcha") {
    await supabase
      .from("servicios_postventa")
      .update({ puesta_en_marcha: fecha })
      .eq("id", datos.servicioId);
    revalidatePath(`/postventa/pedidos/${datos.servicioId}`);
  }

  if (datos.equipoId) {
    const cambios: Record<string, unknown> = {};
    if (datos.ciclos != null) {
      cambios.ciclos_ultimo = datos.ciclos;
      cambios.ciclos_ultimo_at = fecha;
      if (datos.tipo === "puesta_en_marcha") cambios.ciclos_inicial = datos.ciclos;
    }
    if (datos.tipo === "puesta_en_marcha") cambios.fecha_puesta_marcha = fecha;
    if (datos.tipo.startsWith("mantenimiento")) {
      cambios.ultimo_mantenimiento = fecha;
      cambios.proximo_mantenimiento = new Date(new Date(fecha + "T12:00:00").getTime() + 6 * 30 * 864e5)
        .toISOString()
        .slice(0, 10);
    }
    if (Object.keys(cambios).length > 0) {
      await supabase.from("equipos_instalados").update(cambios).eq("id", datos.equipoId);
    }
    revalidatePath(`/postventa/equipos/${datos.equipoId}`);
  }

  revalidatePath("/postventa/casos");
  revalidatePath("/postventa/atenciones");
  return { error: null as string | null, id: informe?.id as string | undefined };
}

/**
 * Cierra un caso derivado por Central (garantía, repuesto o mantenimiento).
 *
 * Es el botón que Carlos buscó y no encontró: «no hay un clic donde diría que
 * ya está atendido». El caso se cierra con `etapa = venta` cuando se ejecutó y
 * `rechazada` cuando no procedía — el dato es el de siempre, la palabra en
 * pantalla es la del área.
 */
export async function cerrarCaso(oportunidadId: string, resultado: "ejecutado" | "no_procede", nota: string) {
  const supabase = await createClient();
  const perfil = await requerirPerfil();

  // ESTE `update` FALLABA EN SILENCIO. Si el caso es de otra persona, la RLS
  // no lo deja tocar y Postgres NO devuelve error: simplemente no cambia
  // ninguna fila. La pantalla decía «caso cerrado» y el caso seguía abierto —
  // peor que un error, porque nadie vuelve a mirarlo. Se pide `select` para
  // saber si de verdad se movió algo (09-09).
  const { data: movidas, error } = await supabase
    .from("oportunidades")
    .update({
      etapa: resultado === "ejecutado" ? "venta" : "rechazada",
      proxima_accion: null,
      proxima_accion_at: null,
    })
    .eq("id", oportunidadId)
    .select("id");
  if (error) {
    if (esRechazoDeRls(error.message)) {
      return falla(mensajeExpedienteAjeno(await duenoDelExpediente(supabase, oportunidadId)));
    }
    return falla(error.message);
  }
  if (!movidas || movidas.length === 0) {
    return falla(mensajeExpedienteAjeno(await duenoDelExpediente(supabase, oportunidadId)));
  }

  await supabase.from("actividades").insert({
    oportunidad_id: oportunidadId,
    tipo: "nota",
    nota: `${resultado === "ejecutado" ? "Caso atendido" : "No procede"}: ${nota.trim() || "sin detalle"}`,
    realizada_por: perfil.id,
  });

  revalidatePath("/postventa");
  revalidatePath(`/comercial/oportunidades/${oportunidadId}`);
  return { error: null as string | null };
}

/**
 * Los datos de la apertura de servicio que no vivían en ninguna parte.
 *
 * Lesly, 05-09: el correo de apertura sale con nueve filas y casi todas se
 * llenan solas con lo que ya está en el sistema. Estas cinco no: la hora, el
 * día, el técnico que va, cómo se mueve ese técnico y las guías que se piden.
 * Hasta hoy viajaban en la cabeza de quien armaba el correo.
 *
 * Se guardan sueltas, sin exigir que estén todas: postventa las va llenando a
 * medida que las coordina, y la pantalla dice en cada momento qué falta para
 * que el correo salga completo.
 */
export async function guardarAperturaServicio(
  servicioId: string,
  datos: {
    tipo?: string | null;
    fecha?: string | null;
    hora?: string | null;
    tecnico?: string | null;
    transporte?: string | null;
    nota?: string | null;
    direccionFinal?: string | null;
  },
) {
  await requerirPerfil();
  const supabase = await createClient();

  const limpio = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
  if (datos.tipo && !["entrega", "entrega_puesta_marcha", "mantenimiento"].includes(datos.tipo)) {
    return falla("Ese no es uno de los tres formatos de apertura");
  }

  const { error } = await supabase
    .from("servicios_postventa")
    .update({
      apertura_tipo: limpio(datos.tipo),
      apertura_fecha: limpio(datos.fecha),
      apertura_hora: limpio(datos.hora),
      tecnico_asignado: limpio(datos.tecnico),
      transporte: limpio(datos.transporte),
      apertura_nota: limpio(datos.nota),
      direccion_final: limpio(datos.direccionFinal),
    })
    .eq("id", servicioId);
  if (error) return falla(error.message);

  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}/apertura`);
  return ok();
}

/**
 * «Ya lo mandé» — dos marcas de tiempo separadas del correo de la apertura,
 * al almacén y al cliente (0271, ítem 8 de la reunión del 22-09). El CRM deja
 * el correo escrito pero no manda nada (no tiene SMTP); esto es lo mismo que
 * «marcar enviado» en el resto de pasos del pedido, para el paso que hoy solo
 * vive en la bandeja de correo de la persona.
 */
export async function marcarAperturaEnviada(servicioId: string, destino: "almacen" | "cliente") {
  await requerirPerfil();
  const supabase = await createClient();

  const campo = destino === "almacen" ? "apertura_enviada_almacen_at" : "apertura_enviada_cliente_at";
  const { error } = await supabase
    .from("servicios_postventa")
    .update({ [campo]: new Date().toISOString() })
    .eq("id", servicioId);
  if (error) return falla(error.message);

  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}/apertura`);
  return ok();
}

/**
 * Gerencia u operaciones fijan la condición de pago de un pedido ya emitido
 * (0232): qué % debe estar pagado antes de despachar y a cuántos días va el
 * saldo. Para los cierres nuevos viene del informe; esto es para los que ya
 * estaban en curso el 14-09 y para corregir uno mal leído. La función de la
 * base verifica el rol y lo escribe también en el informe.
 */
export async function definirCondicionPago(
  servicioId: string,
  datos: { pct: number; dias?: number | null; nota?: string },
) {
  await requerirPerfil();
  const supabase = await createClient();
  const pct = Number(datos.pct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return falla("El porcentaje antes del despacho va de 0 a 100");
  const dias = pct >= 100 ? null : datos.dias == null ? null : Math.round(Number(datos.dias));
  if (pct < 100 && (dias == null || !Number.isFinite(dias) || dias < 0 || dias > 365))
    return falla("Si queda saldo a crédito, diga a cuántos días (0 a 365)");
  const { error } = await supabase.rpc("definir_condicion_pago_pedido", {
    p_servicio: servicioId,
    p_pct: pct,
    p_dias: dias,
    p_nota: datos.nota?.trim() || null,
  });
  if (error) return falla(error.message.replace(/^[A-Z0-9]{5}:\s*/, ""));
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath("/postventa/control");
  revalidatePath("/gerencia/finanzas");
  return ok();
}

// ── Qué se vendió, y los pedidos anteriores al circuito (0237/0239) ────────

/**
 * Postventa corrige el tipo de circuito del pedido cuando la primera lectura
 * del informe no coincide: «venta de repuesto o de equipo… con entrega en
 * planta o en agencia, con instalación o sin instalación» (Carlos, 15-09).
 */
export async function definirTipoPedido(
  servicioId: string,
  datos: { tipo: "equipo" | "repuesto" | "mantenimiento" | "revision"; entregaEn?: "planta" | "agencia" | "cliente" | null; conInstalacion?: boolean | null },
) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase
    .from("servicios_postventa")
    .update({
      tipo_pedido: datos.tipo,
      entrega_en: datos.tipo === "repuesto" ? (datos.entregaEn ?? null) : null,
      con_instalacion: datos.tipo === "repuesto" ? (datos.conInstalacion ?? null) : null,
    })
    .eq("id", servicioId);
  if (error) return falla(error.message);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath("/postventa/control");
  return ok();
}

/**
 * Un pedido anterior al circuito entra a preparación desde la ficha del
 * cliente (0239): Choquehuanca, JMZ, las 20 máquinas de MG. Ya nace
 * ejecutado, liquidado y aprobado, porque eso pasó antes del CRM.
 */
export async function traerPedidoAntiguo(datos: {
  cuentaId: string;
  equipo: string;
  tipo: "equipo" | "repuesto" | "mantenimiento" | "revision";
  monto?: number | null;
  moneda?: "USD" | "PEN";
  fechaVenta?: string | null;
  referencia?: string | null;
  nota?: string | null;
  entregaEn?: "planta" | "agencia" | "cliente" | null;
  conInstalacion?: boolean | null;
}): Promise<{ error: string | null; id?: string }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("traer_pedido_antiguo", {
    p_cuenta: datos.cuentaId,
    p_equipo: datos.equipo.trim(),
    p_tipo: datos.tipo,
    p_monto: datos.monto ?? null,
    p_moneda: datos.moneda ?? "USD",
    p_fecha_venta: datos.fechaVenta || null,
    p_referencia: datos.referencia?.trim() || null,
    p_nota: datos.nota?.trim() || null,
    p_entrega_en: datos.entregaEn ?? null,
    p_con_instalacion: datos.conInstalacion ?? null,
  });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  revalidatePath("/postventa/pedidos");
  revalidatePath("/postventa/control");
  revalidatePath("/postventa/agenda");
  return { error: null, id: data as string };
}
