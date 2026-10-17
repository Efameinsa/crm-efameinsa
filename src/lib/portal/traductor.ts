/**
 * LO QUE VE EL CLIENTE, TRADUCIDO DEL CRM (contrato «Experiencia del cliente», 17-10).
 *
 * El CRM habla de aperturas, vistos buenos, protocolos y etapas; el cliente
 * de efameinsa.com solo necesita saber en qué va lo suyo. Acá vive esa
 * traducción, sin base de datos, para poder probarla: los pasos del pedido,
 * la etapa del caso, el estado de la cotización y qué archivo es foto y cuál
 * documento.
 *
 * Regla dura: nada de lo que sale de acá nombra un estado interno, una tabla,
 * una nota, un monto ni a otra área. Solo claves del contrato y fechas.
 */

import { circuitoDe, pedidoSinCobro, type ServicioPostventa } from "@/lib/postventa";

export type ClavePaso =
  | "confirmado"
  | "pago"
  | "plano"
  | "probado"
  | "despacho_programado"
  | "salio"
  | "agencia"
  | "recibido"
  | "instalacion_agendada"
  | "tecnico_salio"
  | "tecnico_llego"
  | "puesta_en_marcha"
  | "documentos";

export interface PasoCliente {
  clave: ClavePaso;
  fecha: string | null;
}

export type TipoPedidoCliente = "equipo" | "repuesto" | "mantenimiento" | "garantia" | "otro";
export type EtapaCasoCliente = "recibido" | "programado" | "en_camino" | "en_atencion" | "resuelto" | "cerrado";
export type EstadoCotizacionCliente = "enviada" | "aceptada" | "vencida" | "anulada" | "perdida";
export type TipoCasoCliente =
  | "problema_tecnico"
  | "solicitud_repuesto"
  | "solicitud_mantenimiento"
  | "revision_garantia"
  | "puesta_en_marcha"
  | "soporte_tecnico"
  | "capacitacion"
  | "otro";

/** Lo que se lee del pedido para traducirlo: las columnas reales de servicios_postventa. */
export type PedidoParaCliente = Partial<ServicioPostventa> &
  Pick<ServicioPostventa, "id"> & {
    created_at?: string | null;
    recibido_cliente_at?: string | null;
    tecnico_salio_at?: string | null;
    tecnico_llego_at?: string | null;
    pedido_ejecutado_at?: string | null;
  };

const ZONA_LIMA = "-05:00";

/** Una fecha sola («2026-10-17») como mediodía de Lima, para que ningún huso la corra de día. */
export function diaComoIso(dia: string | null | undefined, hora?: string | null): string | null {
  if (!dia) return null;
  const d = String(dia).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const h = (hora ?? "").trim();
  const hhmm = /^\d{1,2}:\d{2}/.test(h) ? h.slice(0, 5).padStart(5, "0") : "12:00";
  return `${d}T${hhmm}:00${ZONA_LIMA}`;
}

function marcadoEnExcel(texto: string | null | undefined): boolean {
  if (!texto) return false;
  const t = texto.trim().toUpperCase();
  return t === "SI" || t === "SÍ" || t === "OK" || t === "LISTO" || t === "X";
}

/** El tipo de pedido como lo entiende el cliente. */
export function tipoPedidoCliente(s: Pick<PedidoParaCliente, "tipo_pedido" | "tipo_servicio"> & { apertura_tipo?: string | null }): TipoPedidoCliente {
  const tipo = s.tipo_pedido ?? "equipo";
  const esGarantia = /garant/i.test(s.tipo_servicio ?? "") || /garantia/i.test(s.apertura_tipo ?? "");
  if (tipo === "equipo") return "equipo";
  if (esGarantia) return "garantia";
  if (tipo === "repuesto" || tipo === "accesorio") return "repuesto";
  if (tipo === "mantenimiento") return "mantenimiento";
  return "otro";
}

/** El primer renglón del equipo, sin saltos: «Lavadora UniMac UW45…». */
export function tituloPedido(equipo: string | null | undefined): string {
  const linea = (equipo ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  if (!linea) return "Su pedido";
  return linea.length > 120 ? `${linea.slice(0, 117)}…` : linea;
}

/**
 * Los pasos del pedido, solo los que aplican y en el orden del contrato.
 *
 * `instalacionProgramada`: la hora de la puesta en marcha agendada (el caso
 * de puesta en marcha enganchado al pedido). `documentosAt`: cuándo se le
 * mandó el primer informe. Un paso con `fecha: null` está pendiente.
 *
 * Lo cerrado se lee como hecho: un pedido terminado del Excel no tiene la
 * hora de cada paso, pero el cliente ya lo tiene; dejarle los pasos vacíos
 * sería decirle que no le llegó. Los que no tienen fecha toman la del cierre.
 */
export function pasosDelPedido(
  s: PedidoParaCliente,
  extra: { instalacionProgramada?: string | null; documentosAt?: string | null } = {},
): PasoCliente[] {
  const c = circuitoDe(s as ServicioPostventa);
  const enPlanta = c.entregaEnPlanta || s.entrega_modo === "planta";
  const porAgencia = s.entrega_modo === "agencia" || s.entrega_en === "agencia" || Boolean(s.agencia_at);
  const conTecnico = !(c.esRepuesto && !c.conInstalacion) && !c.esEmbalaje && !c.esAccesorio;
  const provincia = s.modalidad === "provincia";
  const cerrado = Boolean(s.cerrado_at) || s.completado === true;
  const creado = s.created_at ?? diaComoIso(s.fecha_confirmacion) ?? null;
  const respaldo = s.cerrado_at ?? diaComoIso(s.puesta_en_marcha) ?? s.despachado_at ?? diaComoIso(s.fecha_despacho) ?? creado;

  const pasos: PasoCliente[] = [];
  const poner = (clave: ClavePaso, fecha: string | null | undefined, hechoSinFecha = false) =>
    pasos.push({ clave, fecha: fecha ?? (hechoSinFecha ? respaldo : null) });

  poner("confirmado", s.aprobado_at ?? s.pedido_ejecutado_at ?? diaComoIso(s.fecha_confirmacion) ?? creado, true);

  if (!pedidoSinCobro({ origen: s.origen ?? "", pago_confirmado_at: s.pago_confirmado_at ?? null })) {
    const creditoAprobado = s.pct_antes_despacho != null && Number(s.pct_antes_despacho) === 0 && s.finanzas_vb_at != null;
    poner(
      "pago",
      s.pago_confirmado_at ?? (creditoAprobado ? s.finanzas_vb_at : null),
      marcadoEnExcel(s.confirmacion_abono),
    );
  }

  if (c.esEquipo && !s.sin_plano) poner("plano", s.plano_enviado_at, marcadoEnExcel(s.planos_preinstalacion));

  if (!c.esServicio) poner("probado", s.prueba_lista_at, marcadoEnExcel(s.prueba_embalaje));

  if (!c.esServicio) {
    if (enPlanta) {
      // Lo recoge en nuestra planta: no hay camión ni agencia; entregarlo es recibirlo.
      poner("recibido", s.recibido_cliente_at ?? s.despachado_at);
    } else {
      poner("despacho_programado", diaComoIso(s.fecha_despacho, s.despacho_hora) ?? s.despachado_at);
      poner("salio", s.despachado_at);
      if (porAgencia) poner("agencia", s.agencia_at);
      poner("recibido", s.recibido_cliente_at);
    }
  }

  if (conTecnico) {
    poner(
      "instalacion_agendada",
      extra.instalacionProgramada ?? (c.esServicio ? diaComoIso(s.fecha_despacho, s.despacho_hora) ?? diaComoIso(s.apertura_fecha, s.apertura_hora) : null),
      Boolean(s.puesta_en_marcha),
    );
    // En provincia la puesta en marcha suele ser por videollamada: el técnico
    // no viaja, y el paso solo aparece si alguien lo marcó.
    const viajaTecnico = !provincia || c.esServicio || s.tecnico_salio_at || s.tecnico_llego_at;
    if (viajaTecnico) {
      poner("tecnico_salio", s.tecnico_salio_at, Boolean(s.tecnico_llego_at || s.puesta_en_marcha));
      // En un servicio, «despachado» ya quiere decir «técnico en el cliente».
      poner("tecnico_llego", s.tecnico_llego_at ?? (c.esServicio ? s.despachado_at : null), Boolean(s.puesta_en_marcha));
    }
    poner("puesta_en_marcha", diaComoIso(s.puesta_en_marcha));
  }

  poner("documentos", extra.documentosAt ?? s.cerrado_at ?? null);

  if (cerrado) for (const p of pasos) if (!p.fecha) p.fecha = respaldo;
  return pasos;
}

/** La etapa del caso como la ve el cliente. */
export function etapaCasoCliente(a: {
  etapa: string;
  programada_at?: string | null;
  tecnico_salio_at?: string | null;
  tecnico_llego_at?: string | null;
  cerrado_at?: string | null;
  resultado?: string | null;
}): EtapaCasoCliente {
  if (a.cerrado_at) return a.resultado === "resuelto" || a.resultado == null ? "resuelto" : "cerrado";
  if (a.etapa === "cierre" || a.etapa === "seguimiento") return "resuelto";
  if (a.tecnico_llego_at || ["atencion", "pruebas", "conformidad"].includes(a.etapa)) return "en_atencion";
  if (a.tecnico_salio_at) return "en_camino";
  if (a.programada_at || a.etapa === "planificacion") return "programado";
  return "recibido";
}

const TIPOS_CASO: TipoCasoCliente[] = [
  "problema_tecnico",
  "solicitud_repuesto",
  "solicitud_mantenimiento",
  "revision_garantia",
  "puesta_en_marcha",
  "soporte_tecnico",
  "capacitacion",
  "otro",
];

export function tipoCasoCliente(tipo: string | null | undefined): TipoCasoCliente {
  return (TIPOS_CASO as string[]).includes(tipo ?? "") ? (tipo as TipoCasoCliente) : "otro";
}

/** La cotización: el borrador no se muestra (null); la enviada que pasó su validez, vencida. */
export function estadoCotizacionCliente(
  c: { estado: string; anulada_at?: string | null },
  validaHasta: string | null,
  ahora = Date.now(),
): EstadoCotizacionCliente | null {
  if (c.anulada_at || c.estado === "anulada") return "anulada";
  switch (c.estado) {
    case "enviada":
      return validaHasta && new Date(validaHasta).getTime() < ahora ? "vencida" : "enviada";
    case "aceptada":
    case "vencida":
    case "perdida":
      return c.estado;
    default:
      return null;
  }
}

/** Hasta cuándo vale: desde que salió (o se creó), más los días de vigencia. */
export function validaHasta(c: { enviada_at?: string | null; created_at?: string | null; vigencia_dias?: number | null }): string | null {
  const base = c.enviada_at ?? c.created_at;
  if (!base || c.vigencia_dias == null) return null;
  const t = new Date(base).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + Number(c.vigencia_dias) * 86_400_000).toISOString();
}

export interface ArchivoGuardado {
  path?: string | null;
  nombre?: string | null;
  tipo?: string | null;
  tipo_mime?: string | null;
  etiqueta?: string | null;
}

/**
 * ¿Foto, documento o ninguno? El video no se manda (pesa y la web no lo muestra);
 * la foto de la guía es un documento: «Guía de remisión».
 */
export function clasificarArchivo(f: ArchivoGuardado | null | undefined): "foto" | "documento" | null {
  if (!f || typeof f.path !== "string" || !f.path) return null;
  const tipo = (f.tipo ?? f.tipo_mime ?? "").toLowerCase();
  const nombre = `${f.nombre ?? ""} ${f.path}`.toLowerCase();
  if (tipo.startsWith("video/") || /\.(mp4|mov|webm|avi|3gp)\b/.test(nombre) || f.etiqueta === "video") return null;
  if (tipo.includes("pdf") || tipo.includes("word") || tipo.includes("officedocument") || /\.(pdf|docx?|xlsx?)\b/.test(nombre)) return "documento";
  const imagen = tipo.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif)\b/.test(nombre);
  if (!imagen) return null;
  return f.etiqueta === "guia" || f.etiqueta === "protocolo" ? "documento" : "foto";
}

/** El nombre del documento que ve el cliente, según de dónde salió. */
export function nombreDocumento(f: ArchivoGuardado, origen: "protocolo" | "salida" | "agencia" | "informe" | "puesta_en_marcha"): string {
  if (f.etiqueta === "guia") return "Guía de remisión";
  if (origen === "protocolo") return "Protocolo de prueba";
  if (origen === "puesta_en_marcha") return "Informe de puesta en marcha";
  if (origen === "informe") return "Informe de servicio";
  return "Documento de su pedido";
}

/** El teléfono como lo guarda la base (`normalizar_telefono`, 0001): solo dígitos, sin el 51 de más. */
export function normalizarTelefono(t: string | null | undefined): string | null {
  if (t == null) return null;
  const d = String(t).replace(/\D/g, "");
  return d.length > 9 && d.startsWith("51") ? d.slice(2) : d;
}
