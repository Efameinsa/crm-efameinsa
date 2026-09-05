"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar } from "@/lib/notificaciones";
import { bloquesPedido, type ServicioPostventa } from "@/lib/postventa";

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

// ── Central: los dos checks que liberan el pedido ──────────────────────────

export async function liberarPedido(datos: {
  informeId: string;
  numeroPedido?: string | null;
  marcarPedido?: boolean;
  marcarLiquidacion?: boolean;
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
          cuerpo: servicio.cliente_texto ?? "Central liberó un pedido",
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
  datos: { quien: string; medio: string; montoPagado?: number | null; completo?: boolean; nota?: string; capturaPath?: string | null },
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

  const { data: fila } = await supabase.from("servicios_postventa").select("monto").eq("id", servicioId).single();
  if (!fila) return falla("No se encontró el pedido");

  const detalle = [
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
export async function verificarDireccion(
  servicioId: string,
  datos: { direccion: string; confirmoNombre: string; recibeNombre?: string; recibeDoc?: string; recibeTelefono?: string },
) {
  const supabase = await createClient();
  if (!datos.direccion.trim()) return falla("Escriba la dirección tal como la confirmó el cliente");

  const { error } = await supabase
    .from("servicios_postventa")
    .update({
      direccion_entrega: datos.direccion.trim(),
      direccion_verificada_at: new Date().toISOString(),
      direccion_verificada_con: datos.confirmoNombre.trim() || null,
      ...(datos.recibeNombre?.trim() ? { recibe_nombre: datos.recibeNombre.trim() } : {}),
      ...(datos.recibeDoc?.trim() ? { recibe_doc: datos.recibeDoc.trim() } : {}),
      ...(datos.recibeTelefono?.trim() ? { recibe_telefono: datos.recibeTelefono.trim() } : {}),
    })
    .eq("id", servicioId);
  if (error) return falla(error.message);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return ok();
}

export async function programarDespacho(servicioId: string, fecha: string, nota?: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("servicios_postventa")
    .update({ fecha_despacho: fecha || null, despacho_nota: nota?.trim() || null })
    .eq("id", servicioId);
  if (error) return falla(error.message);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return ok();
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
    .select("monto, monto_pagado, moneda, informe_cierre_id, pago_confirmado_at, confirmacion_abono")
    .eq("id", servicioId)
    .single();

  const saldo = Math.max(0, Number(servicio?.monto ?? 0) - Number(servicio?.monto_pagado ?? 0));
  // Solo se exige la autorización cuando el saldo es un dato real. En las filas
  // que vinieron del Excel el monto pagado nunca se cargó, y trabar por un
  // saldo inventado sería peor que no trabar nada.
  const saldoConocido =
    servicio?.informe_cierre_id != null || servicio?.pago_confirmado_at != null || Number(servicio?.monto_pagado ?? 0) > 0;

  if (saldo > 0 && saldoConocido && !datos.motivoSinCancelar?.trim()) {
    return falla(
      `Queda un saldo de ${servicio?.moneda ?? "USD"} ${saldo.toLocaleString("es-PE")}. Para despachar igual, indique quién lo autorizó y por qué.`,
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
  for (const serie of series) {
    const base = s.despachado_at?.slice(0, 10) ?? s.fecha_despacho ?? s.puesta_en_marcha ?? s.fecha_confirmacion;
    const proximo = base
      ? new Date(new Date(base + "T12:00:00").getTime() + mantenimiento * 30 * 864e5).toISOString().slice(0, 10)
      : null;

    await supabase.from("equipos_instalados").upsert(
      {
        serie,
        cuenta_id: s.cuenta_id,
        cliente_texto: s.cliente_texto,
        modelo_texto: s.equipo,
        servicio_id: s.id,
        informe_cierre_id: s.informe_cierre_id,
        fecha_venta: s.fecha_confirmacion,
        fecha_despacho: s.despachado_at?.slice(0, 10) ?? s.fecha_despacho,
        guia_remision: s.guia,
        fecha_puesta_marcha: s.puesta_en_marcha,
        garantia_meses: garantia,
        proximo_mantenimiento: proximo,
        ubicacion: s.ubicacion,
      },
      { onConflict: "serie" },
    );
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
  /**
   * Fotos YA subidas al bucket privado `adjuntos` por el cliente; acá solo se
   * guardan los metadatos, igual que en el registro de gestión. El manual las
   * exige en los cinco formatos —«todo proceso contará con un registro
   * fotográfico que será adjuntado en el informe»— y son lo que Carlos quiere
   * poder mostrar cuando el cliente reclama: «venga el informe, la foto… ahí
   * está la hora y fecha, no hay problema». Máximo 10.
   */
  fotos?: { path: string; nombre: string; tipo: string; tamano: number }[];
}) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const anio = new Date().getFullYear();
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
      fotos: (datos.fotos ?? []).slice(0, 10).map((f) => ({
        path: String(f.path).slice(0, 300),
        nombre: String(f.nombre).slice(0, 120),
        tipo: String(f.tipo).slice(0, 100),
        tamano: Number(f.tamano) || 0,
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

  const { error } = await supabase
    .from("oportunidades")
    .update({
      etapa: resultado === "ejecutado" ? "venta" : "rechazada",
      proxima_accion: null,
      proxima_accion_at: null,
    })
    .eq("id", oportunidadId);
  if (error) return falla(error.message);

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
