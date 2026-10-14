"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar, notificarAlmacen, notificarFacturacion, notificarFinanzas } from "@/lib/notificaciones";
import { createAdminClient } from "@/lib/supabase/admin";
import { enlaceApp } from "@/lib/url-app";
import { correoAlArea } from "@/lib/correo-al-area";
import { evaluarPagoParaDespacho, textoComprobante, textoCondicionPago, type ServicioPostventa } from "@/lib/postventa";

/**
 * Lo que Finanzas escribe en el CRM (0279). Solo dos cosas, y las dos por
 * funciones de la base que validan el rol: confirmar un abono ACREDITADO y
 * observar un pago que no aparece. Cada una avisa a quien espera la
 * respuesta: postventa (sin cifras: no ve precios) y el comercial del cierre.
 */

type Resultado = { error: string | null };

function limpiar(mensaje: string): string {
  const m = mensaje.replace(/^[A-Z0-9]{5}:\s*/, "");
  if (/violates|constraint|null value|invalid input|syntax/i.test(m)) {
    return `No se pudo guardar por una falla del sistema, no por lo que escribió. Avise a Santos (${m.slice(0, 120)}).`;
  }
  return m;
}

/** A quién avisa Finanzas (0295; Carlos, 23-09 17:48: «acá le tiene que permitir elegir… postventa, comercial. Check, check»). */
export type Avisar = { comercial: boolean; postventa: boolean };
const A_AMBOS: Avisar = { comercial: true, postventa: true };

async function avisarInteresados(
  servicioId: string,
  armar: (s: { cliente: string; cubierto: boolean; esPrueba: boolean }) => { titulo: string; cuerpoPostventa: string; cuerpoComercial: string },
  avisar: Avisar = A_AMBOS,
) {
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("servicios_postventa")
    .select("cliente_texto, monto, monto_pagado, pct_antes_despacho, informe_cierre_id, pago_confirmado_at, es_prueba, informes_cierre!servicios_postventa_informe_cierre_id_fkey(creado_por)")
    .eq("id", servicioId)
    .maybeSingle();
  if (!s) return;
  const cliente = (s.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  const cubierto = evaluarPagoParaDespacho(s as unknown as ServicioPostventa).cubierto;
  const texto = armar({ cliente, cubierto, esPrueba: s.es_prueba === true });

  const { data: postventa } = avisar.postventa
    ? await supabase.from("perfiles").select("id").eq("es_postventa", true).eq("activo", true).eq("solo_preventivo", false).is("espejo_de", null).eq("es_prueba", s.es_prueba === true)
    : { data: [] };
  const comercial = avisar.comercial ? ((s.informes_cierre as unknown as { creado_por: string | null } | null)?.creado_por ?? null) : null;
  await Promise.all([
    ...(postventa ?? []).map((p) =>
      notificar({ userId: p.id, tipo: "finanzas", titulo: texto.titulo, cuerpo: texto.cuerpoPostventa, url: `/postventa/pedidos/${servicioId}` }),
    ),
    ...(comercial
      ? [notificar({ userId: comercial, tipo: "finanzas", titulo: texto.titulo, cuerpo: texto.cuerpoComercial, url: `/pedidos/${servicioId}/pagos` })]
      : []),
  ]);
}

export async function confirmarAbono(datos: {
  servicioId: string;
  monto: number;
  fecha: string;
  operacion: string;
  medio: string;
  capturaPath?: string | null;
  nota?: string;
  /** Lo que el banco descontó (comisión) o faltó, y por qué (0292). */
  descuento?: { monto: number; motivo: string; adjuntoPath?: string | null } | null;
  avisar?: Avisar;
}): Promise<Resultado & { total?: number }> {
  await requerirPerfil();
  if (!Number.isFinite(datos.monto) || datos.monto <= 0) return { error: "Escriba el monto que entró a la cuenta" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) return { error: "Falta la fecha del abono" };
  if (!datos.operacion.trim()) return { error: "Falta el número de operación del banco" };
  if (!datos.medio.trim()) return { error: "Diga en qué banco o por qué medio entró" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finanzas_confirmar_abono", {
    p_servicio: datos.servicioId,
    p_monto: datos.monto,
    p_fecha: datos.fecha,
    p_operacion: datos.operacion.trim(),
    p_medio: datos.medio.trim(),
    p_captura: datos.capturaPath?.trim() || null,
    p_nota: datos.nota?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  let desc = datos.descuento && datos.descuento.monto > 0 ? datos.descuento : null;
  let errorDescuento: string | null = null;
  if (desc) {
    const { error: e2 } = await supabase.rpc("finanzas_anotar_descuento", {
      p_servicio: datos.servicioId,
      p_monto: desc.monto,
      p_motivo: desc.motivo,
      p_adjunto: desc.adjuntoPath?.trim() || null,
    });
    // El abono ya está: se avisa igual y se informa lo que faltó.
    if (e2) {
      errorDescuento = `El abono quedó confirmado y avisado, pero no se anotó el descuento: ${limpiar(e2.message)}`;
      desc = null;
    }
  }

  const monto = datos.monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const descTexto = desc ? desc.monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  await avisarInteresados(datos.servicioId, ({ cliente, cubierto }) => ({
    titulo: `Finanzas confirmó un abono · ${cliente}`,
    // Postventa no ve cifras (Carlos, 27-08): se le dice si ya puede avanzar.
    cuerpoPostventa: cubierto
      ? "Ya está acreditado lo acordado antes del despacho: el pedido puede seguir."
      : desc
        ? "Entró un abono con un descuento del banco: falta la diferencia y la está gestionando el comercial."
        : "Entró un abono, pero todavía no cubre lo acordado antes del despacho.",
    // Carlos, 23-09: la comisión «lo ve el comercial… lo cuestiona con el
    // cliente, lo cobra y registra la llamada con el voucher».
    cuerpoComercial: `Abono de ${monto} acreditado (op. ${datos.operacion.trim()}, ${datos.medio.trim()}).${
      desc
        ? ` Descontaron ${descTexto} (${desc.motivo.trim()})${desc.adjuntoPath ? ", con la evidencia del banco en el aviso" : ""}: cóbrelo al cliente, registre la gestión con el voucher y Finanzas lo confirma.`
        : ""
    }${cubierto ? " Ya cubre lo acordado antes del despacho." : " Todavía falta para lo acordado antes del despacho."}`,
  }), datos.avisar ?? A_AMBOS);

  revalidatePath("/finanzas");
  revalidatePath("/finanzas/cobrar");
  revalidatePath("/finanzas/confirmados");
  revalidatePath(`/finanzas/pedidos/${datos.servicioId}`);
  revalidatePath(`/postventa/pedidos/${datos.servicioId}`);
  return { error: errorDescuento, total: Number(data) };
}

export async function observarPago(datos: { servicioId: string; motivo: string; adjuntoPath?: string | null; avisar?: Avisar }): Promise<Resultado> {
  await requerirPerfil();
  const motivo = datos.motivo.trim();
  if (motivo.length < 10) return { error: "Escriba qué pasa con el pago (mínimo una frase)" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("finanzas_observar_pago", {
    p_servicio: datos.servicioId,
    p_motivo: motivo,
    p_adjunto: datos.adjuntoPath?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };

  await avisarInteresados(datos.servicioId, ({ cliente }) => ({
    titulo: `Finanzas observó el pago · ${cliente}`,
    cuerpoPostventa: `${motivo} — el pedido no avanza hasta que se aclare.`,
    cuerpoComercial: `${motivo}${datos.adjuntoPath ? " (la evidencia está en el aviso)" : ""} — hable con el cliente y avísele a Finanzas.`,
  }), datos.avisar ?? A_AMBOS);

  revalidatePath("/finanzas");
  revalidatePath(`/finanzas/pedidos/${datos.servicioId}`);
  revalidatePath(`/postventa/pedidos/${datos.servicioId}`);
  return { error: null };
}

/**
 * LA EMPRESA DE UN PEDIDO SIN CIERRE (0432). Buzón, Jhon 10-10: para buscar el
 * abono en la carpeta y el banco de la empresa correcta. Los pedidos del Excel
 * de postventa no traen empresa; Finanzas la deja anotada y la apertura sale
 * con la misma. Con cierre, manda la serie del cierre (la base lo frena).
 */
export async function anotarEmpresaDelPedido(servicioId: string, empresa: "EFAMEINSA" | "OPEN"): Promise<Resultado> {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("finanzas_anotar_empresa", { p_servicio: servicioId, p_empresa: empresa });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/finanzas");
  revalidatePath(`/finanzas/pedidos/${servicioId}`);
  return { error: null };
}

/**
 * POSTVENTA LE PIDE A FINANZAS QUE CONFIRME EL ABONO (0295). Carlos, 23-09
 * 17:48: «tiene que haber un clic para que le manden automático a Finanzas, y
 * una notificación que diga: me solicita confirmar el abono del pedido 55».
 * Reemplaza el registro a mano con la captura del correo. Finanzas responde
 * con «Confirmar abono» u «Observar el pago», y eso le llega a postventa.
 */
export async function solicitarConfirmacionPago(servicioId: string): Promise<Resultado> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("postventa_solicitar_confirmacion_pago", { p_servicio: servicioId });
  if (error) return { error: limpiar(error.message) };
  const { data: s } = await supabase.from("servicios_postventa").select("cliente_texto, numero_pedido_erp, es_prueba").eq("id", servicioId).maybeSingle();
  const cliente = (s?.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  await notificarFinanzas({
    titulo: `Confirmar abono · ${cliente}`,
    cuerpo: `${perfil.nombre ?? "Postventa"} le pide confirmar el abono${s?.numero_pedido_erp ? ` del pedido ${s.numero_pedido_erp}` : ""}: ¿pagó completo, parcial o no pagó?`,
    url: `/finanzas/pedidos/${servicioId}`,
    esPrueba: s?.es_prueba === true,
  });
  revalidatePath("/finanzas");
  revalidatePath(`/finanzas/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return { error: null };
}

/**
 * FINANZAS CONFIRMA LA GUÍA (0308, audio de gerencia 25-09 14:20: «para que
 * con esta notificación él pueda confirmarle al almacén: ok, te autorizo,
 * emite tu guía de salida»). Revisó la apertura que emitió postventa; el
 * almacén recibe el aviso.
 */
export async function confirmarGuia(
  servicioId: string,
  nota: string,
  /** Con qué comprobante sale (0384; Lesly, 02-10: «si tiene factura o boleta, nos pongan los números»). */
  comprobante: { tipo: "factura" | "boleta" | "sin_comprobante" | null; numero: string },
) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("finanzas_confirmar_guia", {
    p_servicio: servicioId,
    p_nota: nota.trim() || null,
    p_comprobante_tipo: comprobante.tipo,
    p_comprobante_numero: comprobante.numero.trim() || null,
  });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  const { data: s } = await supabase.from("servicios_postventa").select("cliente_texto, numero_pedido_erp, apertura_despacho_por").eq("id", servicioId).maybeSingle();
  const quien = (s?.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  const conQue = textoComprobante(comprobante.tipo, comprobante.numero.trim() || null);
  // La autoriza Contabilidad (la cuenta de Facturación) y, si no está, Finanzas
  // (buzón, Jhon 12-10; 0439): el aviso dice quién fue.
  const area = perfil.rol === "facturacion" ? "Contabilidad" : "Finanzas";
  // Y a quien emitió la apertura (reunión de gerencia 06-10 11:01: «que me
  // llegue a mí una alertita que ya confirmó»).
  if (s?.apertura_despacho_por) {
    await notificar({
      userId: s.apertura_despacho_por as string,
      tipo: "finanzas",
      titulo: `Guía autorizada · ${quien}`,
      cuerpo: `${area} autorizó la guía${s.numero_pedido_erp ? ` del pedido ${s.numero_pedido_erp}` : ""}: el almacén ya puede emitirla.${conQue ? ` ${conQue}.` : ""}`,
      url: `/postventa/pedidos/${servicioId}`,
    });
  }
  await notificarAlmacen({
    titulo: `Guía autorizada · ${quien}`,
    cuerpo: `${area} revisó la apertura${s?.numero_pedido_erp ? ` del pedido ${s.numero_pedido_erp}` : ""}: puede emitir la guía de salida.${conQue ? ` ${conQue}.` : ""}${nota.trim() ? ` Nota: ${nota.trim()}` : ""}`,
    url: `/almacen/pedidos/${servicioId}`,
    esPrueba: perfil.es_prueba === true,
  });
  // Y por correo, al de la empresa del pedido (directorio 0410).
  const delPedido = s?.numero_pedido_erp ? ` del pedido ${s.numero_pedido_erp}` : "";
  await Promise.all([
    correoAlArea({
      areas: ["postventa"],
      servicioId,
      titulo: `Guía autorizada · ${quien}`,
      cuerpo: `${area} autorizó la guía${delPedido}: el almacén ya puede emitirla.${conQue ? ` ${conQue}.` : ""}`,
      url: `/postventa/pedidos/${servicioId}`,
      esPrueba: perfil.es_prueba === true,
    }),
    correoAlArea({
      areas: ["almacen"],
      servicioId,
      titulo: `Guía autorizada · ${quien}`,
      cuerpo: `${area} revisó la apertura${delPedido}: puede emitir la guía de salida.${conQue ? ` ${conQue}.` : ""}${nota.trim() ? ` Nota: ${nota.trim()}` : ""}`,
      url: `/almacen/pedidos/${servicioId}`,
      esPrueba: perfil.es_prueba === true,
    }),
  ]);
  revalidatePath("/finanzas/aperturas");
  revalidatePath("/facturacion/aperturas");
  revalidatePath("/almacen/aperturas-postventa");
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return { error: null };
}

/**
 * LA ORDEN A FINANZAS PARA FACTURAR Y COBRAR (0460; reunión 13-10 11:20,
 * Carlos con AGROCASAGRANDE). En los pedidos a crédito o con saldo después
 * del despacho, postventa termina el servicio, envía el informe y le dice a
 * Finanzas «ahora sí factura y cobra». Antes era un correo a Contabilidad sin
 * más detalle: ahora le llega con el cliente, el cierre, lo que falta cobrar
 * y el enlace al pedido, en la campana y en el correo del área.
 */
export async function ordenarFacturar(servicioId: string, nota: string): Promise<Resultado> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("postventa_orden_facturar", { p_servicio: servicioId, p_nota: nota.trim() || null });
  if (error) return { error: limpiar(error.message) };

  // Postventa no ve cifras; Finanzas sí: el mensaje se arma con la llave de servicio.
  const admin = createAdminClient();
  const { data: s } = await admin
    .from("servicios_postventa")
    .select("cliente_texto, numero_pedido_erp, es_prueba, monto, monto_pagado, moneda, pct_antes_despacho, credito_dias, informe_cierre_id")
    .eq("id", servicioId)
    .maybeSingle();
  const { data: inf } = s?.informe_cierre_id
    ? await admin.from("informes_cierre").select("codigo").eq("id", s.informe_cierre_id).maybeSingle()
    : { data: null };
  const { data: informes } = await admin.from("informes_servicio").select("id, tipo, equipo_texto, created_at").eq("servicio_id", servicioId).order("created_at");
  const cliente = (s?.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  const moneda = s?.moneda ?? "USD";
  const total = s?.monto == null ? null : Number(s.monto);
  const pagado = Number(s?.monto_pagado ?? 0);
  const saldo = total == null ? null : Math.max(0, Number((total - pagado).toFixed(2)));
  const dinero = (n: number) => `${moneda} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const condicion = textoCondicionPago({ pct_antes_despacho: s?.pct_antes_despacho ?? null, credito_dias: s?.credito_dias ?? null });
  const quien = perfil.nombre ?? "Postventa";
  const titulo = `Facturar y cobrar · ${cliente}`;
  const cuerpo = `${quien} terminó${s?.numero_pedido_erp ? ` el pedido ${s.numero_pedido_erp}` : " el pedido"}${inf?.codigo ? ` (cierre ${inf.codigo})` : ""} y pide facturar y cobrar${saldo != null ? ` el saldo de ${dinero(saldo)}` : ""}.${nota.trim() ? ` Nota: ${nota.trim()}` : ""}`;
  const esPrueba = s?.es_prueba === true;
  await notificarFinanzas({ titulo, cuerpo, url: `/finanzas/pedidos/${servicioId}`, esPrueba });
  await notificarFacturacion({ titulo, cuerpo, url: "/facturacion", esPrueba });
  await correoAlArea({
    areas: ["finanzas"],
    servicioId,
    titulo,
    cuerpo,
    url: `/finanzas/pedidos/${servicioId}`,
    esPrueba,
    datos: [
      ...(inf?.codigo ? [{ etiqueta: "Cierre", valor: String(inf.codigo) }] : []),
      ...(total != null ? [{ etiqueta: "Total de la venta", valor: dinero(total) }, { etiqueta: "Ya pagado", valor: dinero(pagado) }] : []),
      ...(saldo != null ? [{ etiqueta: "Por facturar y cobrar", valor: dinero(saldo) }] : []),
      ...(condicion ? [{ etiqueta: "Condición de pago", valor: condicion }] : []),
      ...(informes?.length
        ? [
            {
              etiqueta: "Informes del servicio",
              valor: informes
                .map((i) => `${String(i.tipo ?? "informe").replace(/_/g, " ")} del ${new Date(i.created_at as string).toLocaleDateString("es-PE", { timeZone: "America/Lima" })}${i.equipo_texto ? ` (${String(i.equipo_texto).slice(0, 60)})` : ""}`)
                .join(" · "),
            },
          ]
        : [{ etiqueta: "Informes del servicio", valor: "Todavía no hay informe registrado en el CRM" }]),
      { etiqueta: "Ver el pedido", valor: enlaceApp(`/finanzas/pedidos/${servicioId}`) },
      { etiqueta: "Pedido por", valor: quien },
    ],
  });
  revalidatePath("/finanzas");
  revalidatePath(`/finanzas/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return { error: null };
}

/** Finanzas marca atendida la orden de facturar (0460): postventa lo ve en el pedido. */
export async function atenderOrdenFacturar(servicioId: string): Promise<Resultado> {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("finanzas_atender_orden_facturar", { p_servicio: servicioId });
  if (error) return { error: limpiar(error.message) };
  const { data: s } = await supabase.from("servicios_postventa").select("cliente_texto, orden_facturar_por").eq("id", servicioId).maybeSingle();
  if (s?.orden_facturar_por) {
    await notificar({
      userId: s.orden_facturar_por as string,
      tipo: "finanzas",
      titulo: `Finanzas atendió la orden de facturar · ${(s.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "")}`,
      url: `/postventa/pedidos/${servicioId}`,
    });
  }
  revalidatePath("/finanzas");
  revalidatePath(`/finanzas/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return { error: null };
}

/**
 * EL VISTO BUENO DE FINANZAS PARA LA SALIDA (0469, caso COFACO 14-10).
 *
 * Una venta a crédito no sale sin que Finanzas diga qué pasa con las letras
 * (no lleva, van con el equipo, ya las tiene el cliente, ya firmadas) y, si la
 * hubo, cuánto descontó el banco de comisión interplaza. Al darlo, el almacén
 * y postventa reciben el aviso de que ya puede salir.
 */
export async function darVistoBuenoSalida(datos: {
  servicioId: string;
  letras: "no_lleva" | "van_con_el_equipo" | "entregadas" | "firmadas";
  letrasCantidad?: number | null;
  comision?: number | null;
  nota?: string;
}): Promise<Resultado> {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("finanzas_visto_bueno_salida", {
    p_servicio: datos.servicioId,
    p_letras: datos.letras,
    p_letras_cantidad: datos.letras === "no_lleva" ? null : (datos.letrasCantidad ?? null),
    p_comision: datos.comision ?? null,
    p_nota: datos.nota?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  const { data: s } = await supabase.from("servicios_postventa").select("cliente_texto, es_prueba").eq("id", datos.servicioId).maybeSingle();
  const cliente = (s?.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  const letras =
    datos.letras === "van_con_el_equipo"
      ? ` Las ${datos.letrasCantidad ?? ""} letras van con el equipo: recójalas en Finanzas y marque «Recibí las letras» (sin eso no se registra la salida); al entregarlas, confirme quién las recibió.`.replace("  ", " ")
      : datos.letras === "entregadas"
        ? " El cliente ya tiene las letras."
        : datos.letras === "firmadas"
          ? " Las letras ya están firmadas."
          : "";
  await Promise.all([
    notificarAlmacen({
      titulo: `Finanzas dio el visto bueno · ${cliente}`,
      cuerpo: `Ya puede salir.${letras}`,
      url: `/almacen/pedidos/${datos.servicioId}`,
      esPrueba: s?.es_prueba === true,
    }),
    avisarInteresados(
      datos.servicioId,
      ({ cliente: c }) => ({
        titulo: `Finanzas dio el visto bueno para la salida · ${c}`,
        cuerpoPostventa: `Ya se puede emitir la apertura y despachar.${letras}`,
        cuerpoComercial: `Finanzas revisó el crédito y el equipo ya puede salir.${letras}`,
      }),
      { comercial: false, postventa: true },
    ),
  ]);
  revalidatePath("/finanzas");
  revalidatePath(`/finanzas/pedidos/${datos.servicioId}`);
  revalidatePath(`/postventa/pedidos/${datos.servicioId}`);
  revalidatePath(`/almacen/pedidos/${datos.servicioId}`);
  return { error: null };
}

/** Las letras volvieron firmadas (0469). */
export async function marcarLetrasFirmadas(servicioId: string, nota?: string): Promise<Resultado> {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("finanzas_letras_firmadas", { p_servicio: servicioId, p_nota: nota?.trim() || null });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/finanzas");
  revalidatePath(`/finanzas/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return { error: null };
}

/**
 * La guía salió «sin comprobante todavía» y el comprobante igual se le da al
 * cliente (Jhon, 14-10): Contabilidad o Finanzas anota cuál fue (0469).
 */
export async function anotarComprobanteDeLaGuia(servicioId: string, tipo: "factura" | "boleta", numero: string): Promise<Resultado> {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("anotar_comprobante_de_la_guia", { p_servicio: servicioId, p_tipo: tipo, p_numero: numero.trim() });
  if (error) return { error: limpiar(error.message) };
  revalidatePath(`/finanzas/pedidos/${servicioId}`);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath("/finanzas/aperturas");
  revalidatePath("/facturacion/aperturas");
  return { error: null };
}
