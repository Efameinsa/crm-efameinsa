import type { createClient } from "@/lib/supabase/server";
import { sumarDias } from "@/lib/calendario";

/**
 * LA LISTA DE VISITAS DEL EQUIPO, PARA GERENCIA (ing. Carlos, reunión 01-10
 * 11:05, a Santos).
 *
 * «De las visitas, que ya están en las agendas, pero para mí, ayúdame dándome
 * visibilidad en las visitas… no lo encuentro, visitas, supervisión… estos son
 * algunos indicadores, pero lo que no vi es la bendita visitas, no sé dónde
 * están.» — «Están en la vista de cada comercial.» — «Pero de cada agenda
 * comercial no vi.» — «No le he puesto.»
 *
 * Supervisión ya tenía los CONTADORES (indicadores-comerciales.ts, 30-09). Lo
 * que faltaba es la LISTA: quién visita a quién, qué día, a qué hora, dónde y
 * si se hizo. No hay una tabla de visitas agendadas; la lista se arma de lo
 * que ya existe, sin migración:
 *
 *  · AGENDA. La próxima acción de la oportunidad (`oportunidades.proxima_accion`
 *    con su fecha y hora) es la agenda del comercial —la misma que pinta
 *    /comercial/agenda—. Es TEXTO LIBRE («Visitar al cliente», «se derivará
 *    video llamada…»), así que se reconoce por palabras (`clasificarAccion`).
 *    Cada gestión guarda también la próxima acción que dejó
 *    (`actividades.proxima_accion*`): de ahí salen las visitas que se
 *    agendaron y después se hicieron o se cambiaron por otra cosa, que en la
 *    oportunidad ya no se ven porque la nueva acción las pisó.
 *  · TAREAS de la agenda (`tareas_agenda`) cuyo título habla de una visita.
 *  · VISITAS A LA PLANTA (`visitas_planta`, 0256): el cliente viene.
 *  · HECHAS: las gestiones «Visita», «Videollamada» (`reunion_online`) y
 *    «Showroom». Si calzan con algo agendado, lo marcan como hecho; si no,
 *    salen solas como «registrada sin agendar».
 *
 * Gerencia lee todo eso por RLS (es_backoffice en oportunidades, actividades,
 * cuentas, tareas_agenda y visitas_planta): no hace falta función nueva.
 */

export type ClaseVisita = "visita" | "videollamada" | "planta";
export type EstadoVisita = "pendiente" | "hecha" | "vencida" | "cancelada" | "no_concretada";
export type OrigenVisita = "agenda" | "tarea" | "planta" | "gestion";

export const ETIQUETA_CLASE: Record<ClaseVisita, string> = {
  visita: "Visita al cliente",
  videollamada: "Videollamada",
  planta: "Viene a la planta",
};

export const ETIQUETA_ESTADO: Record<EstadoVisita, string> = {
  pendiente: "Pendiente",
  hecha: "Hecha",
  vencida: "Vencida sin registrar",
  cancelada: "Cancelada",
  no_concretada: "No se concretó",
};

// ─────────────────────────────────────────────────────────────────────────
// Reconocer una visita en el texto de la próxima acción
// ─────────────────────────────────────────────────────────────────────────

const RE_VIDEO = /video\s*-?\s*llamada|videoconferencia|\bzoom\b|\bmeet\b|\bteams\b|reuni[oó]n\s+(virtual|online|en\s+l[ií]nea)/i;
const RE_PLANTA = /\b(planta|showroom)\b/i;
const RE_VISITA = /visit|reuni[oó]n|presencial/i;
/**
 * «Llamar para confirmar la hora de la videollamada» es una LLAMADA: la
 * videollamada todavía no tiene hora. Lo que empieza por estos verbos es la
 * gestión previa, no la visita.
 */
const RE_GESTION_PREVIA = /^\s*(llamar|confirmar|coordinar|preguntar|escribir|enviar|mandar|consultar|recordar)\b/i;

/** Qué clase de visita dice un texto de agenda, o null si no es una visita. */
export function clasificarAccion(texto: string | null | undefined): ClaseVisita | null {
  const t = (texto ?? "").trim();
  if (!t || RE_GESTION_PREVIA.test(t)) return null;
  if (RE_VIDEO.test(t)) return "videollamada";
  if (RE_PLANTA.test(t) && /(vien|vendr|venir|visit|acerc|lleg)/i.test(t)) return "planta";
  if (RE_VISITA.test(t)) return "visita";
  return null;
}

/** Los tipos de gestión que cumplen cada clase de visita. */
const TIPOS_QUE_CUMPLEN: Record<ClaseVisita, readonly string[]> = {
  visita: ["visita", "showroom"],
  videollamada: ["reunion_online"],
  planta: ["showroom", "visita"],
};

export function claseDeGestion(tipo: string): ClaseVisita | null {
  if (tipo === "visita") return "visita";
  if (tipo === "reunion_online") return "videollamada";
  if (tipo === "showroom") return "planta";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Armado (puro, probado en visitas-equipo.test.ts)
// ─────────────────────────────────────────────────────────────────────────

/** Una visita agendada como próxima acción (de la oportunidad o de una gestión). */
export interface PlanAgenda {
  oportunidadId: string;
  cuentaId: string | null;
  cliente: string;
  direccion: string | null;
  comercialId: string;
  texto: string;
  fecha: string;
  hora: string | null;
  /** Cuándo se agendó (la gestión que la dejó); null si viene solo de la oportunidad. */
  programadaAt: string | null;
  /** La oportunidad todavía la tiene como próxima acción (y sigue abierta). */
  vigente: boolean;
  /** Lo que la oportunidad tiene ahora, si la reemplazaron. */
  accionActual: string | null;
  fechaActual: string | null;
}

export interface TareaVisita {
  id: string;
  comercialId: string;
  titulo: string;
  fecha: string;
  hora: string | null;
  completada: boolean;
}

export interface VisitaPlantaFila {
  id: string;
  comercialId: string;
  cuentaId: string | null;
  oportunidadId: string | null;
  empresa: string;
  motivo: string | null;
  fecha: string;
  hora: string | null;
  cancelada: boolean;
  canceladaMotivo: string | null;
  cerrada: boolean;
  noVino: boolean;
  resultado: string | null;
  actividadId: string | null;
}

export interface GestionVisita {
  id: string;
  tipo: string;
  comercialId: string;
  oportunidadId: string | null;
  cuentaId: string | null;
  cliente: string;
  direccion: string | null;
  realizadaAt: string;
  /** Día y hora en Lima. */
  fecha: string;
  hora: string;
  resultadoCodigo: string | null;
  resultadoNombre: string | null;
  nota: string | null;
}

export interface VisitaEquipo {
  clave: string;
  comercialId: string;
  clase: ClaseVisita;
  origen: OrigenVisita;
  /** Se agendó antes (agenda, tarea o planta); false = se registró sin agendar. */
  programada: boolean;
  fecha: string;
  hora: string | null;
  cuentaId: string | null;
  cliente: string;
  lugar: string | null;
  /** El texto de la agenda, el motivo de la visita a planta o la nota de la gestión. */
  detalle: string | null;
  estado: EstadoVisita;
  /** Por qué ese estado: el resultado, «No vino», «Se cambió por…». */
  estadoNota: string | null;
  /** La gestión que la cumplió, si la hay. */
  hechaEl: { fecha: string; hora: string } | null;
}

const RESULTADO_PLANTA: Record<string, string> = {
  compro: "Compró",
  pide_cotizacion: "Pide cotización",
  evaluando: "Evaluando",
  recogio: "Recogió",
  pago: "Pagó",
  solo_miro: "Solo miró",
  no_vino: "No vino",
};

function lugarDe(clase: ClaseVisita, direccion: string | null): string | null {
  if (clase === "videollamada") return "Videollamada";
  if (clase === "planta") return "En la planta";
  return direccion;
}

function corto(t: string | null | undefined, n = 140): string | null {
  const s = (t ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * Junta agenda, tareas, planta y gestiones en una sola lista, una fila por
 * visita, para los días `desde`..`hasta`.
 *
 * Una gestión cumple lo agendado si es de la misma oportunidad (o del mismo
 * cliente), del tipo que corresponde, posterior a cuando se agendó y a más
 * tardar una semana después de la fecha agendada. Cada gestión cumple UNA
 * sola cosa: así una visita no se cuenta dos veces.
 */
export function armarVisitasEquipo(
  datos: { planes: PlanAgenda[]; tareas: TareaVisita[]; planta: VisitaPlantaFila[]; gestiones: GestionVisita[] },
  r: { desde: string; hasta: string; hoy: string },
): VisitaEquipo[] {
  const enRango = (f: string) => f >= r.desde && f <= r.hasta;
  const usadas = new Set<string>();
  const out: VisitaEquipo[] = [];
  const gestiones = [...datos.gestiones].sort((a, b) => a.realizadaAt.localeCompare(b.realizadaAt));

  // 1. La planta, primero: tiene su propio circuito y su gestión enlazada.
  for (const v of datos.planta) {
    if (v.actividadId) usadas.add(v.actividadId);
    if (!enRango(v.fecha)) continue;
    let estado: EstadoVisita;
    let nota: string | null = null;
    if (v.cancelada) {
      estado = "cancelada";
      nota = corto(v.canceladaMotivo, 80);
    } else if (v.noVino || v.resultado === "no_vino") {
      estado = "no_concretada";
      nota = "No vino";
    } else if (v.cerrada) {
      estado = "hecha";
      nota = v.resultado ? (RESULTADO_PLANTA[v.resultado] ?? v.resultado) : null;
    } else {
      estado = v.fecha < r.hoy ? "vencida" : "pendiente";
    }
    const g = v.actividadId ? gestiones.find((x) => x.id === v.actividadId) : undefined;
    out.push({
      clave: `planta:${v.id}`,
      comercialId: v.comercialId,
      clase: "planta",
      origen: "planta",
      programada: true,
      fecha: v.fecha,
      hora: v.hora,
      cuentaId: v.cuentaId,
      cliente: v.empresa,
      lugar: "En la planta",
      detalle: corto(v.motivo),
      estado,
      estadoNota: nota,
      hechaEl: g ? { fecha: g.fecha, hora: g.hora } : null,
    });
  }
  const plantaPorDia = new Set(datos.planta.filter((v) => v.cuentaId).map((v) => `${v.cuentaId}|${v.fecha}`));

  // 2. La agenda. Una fila por oportunidad y día: la oportunidad y la gestión
  //    que la dejó dicen lo mismo; se queda la vigente o la más reciente.
  const planes = new Map<string, PlanAgenda>();
  for (const p of datos.planes) {
    const k = `${p.oportunidadId}|${p.fecha}`;
    const prev = planes.get(k);
    if (!prev) planes.set(k, p);
    else
      planes.set(k, {
        ...(p.vigente || (p.programadaAt ?? "") > (prev.programadaAt ?? "") ? p : prev),
        vigente: p.vigente || prev.vigente,
        programadaAt: [p.programadaAt, prev.programadaAt].filter(Boolean).sort().at(-1) ?? null,
      });
  }
  for (const p of [...planes.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (!enRango(p.fecha)) continue;
    const clase = clasificarAccion(p.texto);
    if (!clase) continue;
    // «El cliente vendrá a planta» ya está como visita a planta ese día.
    if (clase === "planta" && p.cuentaId && plantaPorDia.has(`${p.cuentaId}|${p.fecha}`)) continue;
    const desdeFecha = p.programadaAt ? null : sumarDias(p.fecha, -7);
    const tope = sumarDias(p.fecha, 7);
    const g = gestiones.find(
      (x) =>
        !usadas.has(x.id) &&
        TIPOS_QUE_CUMPLEN[clase].includes(x.tipo) &&
        (x.oportunidadId === p.oportunidadId || (p.cuentaId !== null && x.cuentaId === p.cuentaId)) &&
        (p.programadaAt ? x.realizadaAt > p.programadaAt : x.fecha >= desdeFecha!) &&
        x.fecha <= tope,
    );
    let estado: EstadoVisita;
    let nota: string | null = null;
    if (g) {
      usadas.add(g.id);
      estado = g.resultadoCodigo === "NO_CONTESTO" ? "no_concretada" : "hecha";
      nota = g.resultadoNombre;
    } else if (p.vigente) {
      estado = p.fecha < r.hoy ? "vencida" : "pendiente";
    } else {
      estado = "cancelada";
      nota = p.accionActual
        ? `Se cambió por «${corto(p.accionActual, 60)}»${p.fechaActual ? ` (${p.fechaActual.slice(8, 10)}/${p.fechaActual.slice(5, 7)})` : ""}`
        : "Ya no está en la agenda";
    }
    out.push({
      clave: `agenda:${p.oportunidadId}:${p.fecha}`,
      comercialId: p.comercialId,
      clase,
      origen: "agenda",
      programada: true,
      fecha: p.fecha,
      hora: p.hora,
      cuentaId: p.cuentaId,
      cliente: p.cliente,
      lugar: lugarDe(clase, p.direccion),
      detalle: corto(p.texto),
      estado,
      estadoNota: nota,
      hechaEl: g ? { fecha: g.fecha, hora: g.hora } : null,
    });
  }

  // 3. Tareas sueltas de la agenda que hablan de una visita.
  for (const t of datos.tareas) {
    if (!enRango(t.fecha)) continue;
    const clase = clasificarAccion(t.titulo);
    if (!clase) continue;
    out.push({
      clave: `tarea:${t.id}`,
      comercialId: t.comercialId,
      clase,
      origen: "tarea",
      programada: true,
      fecha: t.fecha,
      hora: t.hora,
      cuentaId: null,
      cliente: corto(t.titulo, 80) ?? "Tarea",
      lugar: lugarDe(clase, null),
      detalle: "Tarea de la agenda",
      estado: t.completada ? "hecha" : t.fecha < r.hoy ? "vencida" : "pendiente",
      estadoNota: t.completada ? "Marcada como hecha en la agenda" : null,
      hechaEl: null,
    });
  }

  // 4. Lo que se registró sin haberse agendado.
  for (const g of gestiones) {
    if (usadas.has(g.id) || !enRango(g.fecha)) continue;
    const clase = claseDeGestion(g.tipo);
    if (!clase) continue;
    out.push({
      clave: `gestion:${g.id}`,
      comercialId: g.comercialId,
      clase,
      origen: "gestion",
      programada: false,
      fecha: g.fecha,
      hora: g.hora,
      cuentaId: g.cuentaId,
      cliente: g.cliente,
      lugar: lugarDe(clase, g.direccion),
      detalle: corto(g.nota),
      estado: g.resultadoCodigo === "NO_CONTESTO" ? "no_concretada" : "hecha",
      estadoNota: g.resultadoNombre,
      hechaEl: { fecha: g.fecha, hora: g.hora },
    });
  }

  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? "99").localeCompare(b.hora ?? "99") || a.cliente.localeCompare(b.cliente));
}

export interface ConteoVisitasEquipo {
  programadas: number;
  hechas: number;
  pendientes: number;
  vencidas: number;
  canceladas: number;
}

export function contarVisitasEquipo(lista: VisitaEquipo[]): ConteoVisitasEquipo {
  return {
    programadas: lista.filter((v) => v.programada).length,
    hechas: lista.filter((v) => v.estado === "hecha").length,
    pendientes: lista.filter((v) => v.estado === "pendiente").length,
    vencidas: lista.filter((v) => v.estado === "vencida").length,
    canceladas: lista.filter((v) => v.estado === "cancelada" || v.estado === "no_concretada").length,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Carga
// ─────────────────────────────────────────────────────────────────────────

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Inicio y fin (exclusivo) de un rango de días de Lima, como instantes. */
function rangoLima(desde: string, hasta: string): { ini: string; fin: string } {
  return { ini: `${desde}T00:00:00-05:00`, fin: `${sumarDias(hasta, 1)}T00:00:00-05:00` };
}

/** De a pedazos: un `.in()` con cientos de ids revienta el largo de la URL (0130, 30-09 nginx 502). */
function enTrozos<T>(lista: T[], n = 40): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n));
  return r;
}

const FMT_LIMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function fechaHoraLima(instante: string): { fecha: string; hora: string } {
  const p = FMT_LIMA.formatToParts(new Date(instante));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { fecha: `${v("year")}-${v("month")}-${v("day")}`, hora: `${v("hour")}:${v("minute")}` };
}

/**
 * Prefiltro en la base, por palabras: la clasificación fina la hace
 * `clasificarAccion`. Con `ilike` y no con regex: en los filtros de la base
 * `\s` no funciona (ver memoria crm-regexp-backslash-s).
 */
function filtroPalabras(col: string): string {
  return ["visit", "video", "reuni", "zoom", "meet", "teams", "planta", "showroom", "presencial"].map((p) => `${col}.ilike.*${p}*`).join(",");
}

const ETAPAS_CERRADAS = new Set(["venta", "rechazada", "derivada", "historico"]);

type CuentaEmb = { razon_social: string | null; direccion: string | null; distrito: string | null; provincia: string | null } | null;

function direccionDe(c: CuentaEmb): string | null {
  if (!c) return null;
  const partes = [c.direccion, c.distrito, c.provincia && c.provincia !== c.distrito ? c.provincia : null]
    .map((x) => (x ?? "").trim())
    .filter(Boolean);
  return partes.length ? partes.join(", ") : null;
}

const hhmm = (h: unknown) => (h ? String(h).slice(0, 5) : null);
const dia = (f: unknown) => String(f).slice(0, 10);

/**
 * Las visitas de `desde` a `hasta` (días de Lima). Con `ids`, solo las de esas
 * personas (el detalle de un comercial, o el equipo sin postventa). Las
 * oportunidades de postventa no entran: son servicio técnico, no venta.
 */
export async function cargarVisitasEquipo(
  supabase: Cliente,
  r: { desde: string; hasta: string; hoy: string; ids?: string[] },
): Promise<VisitaEquipo[]> {
  const CUENTA = "cuentas(razon_social, direccion, distrito, provincia)";
  // Las gestiones se buscan una semana antes y después: la visita agendada
  // para el viernes que se hizo el lunes siguiente igual la cumple.
  const g = rangoLima(sumarDias(r.desde, -7), sumarDias(r.hasta, 7));
  const soloIds = r.ids && r.ids.length ? r.ids : null;

  let qOps = supabase
    .from("oportunidades")
    .select(`id, cuenta_id, comercial_id, etapa, tipo_postventa, proxima_accion, proxima_accion_at, proxima_accion_hora, ${CUENTA}`)
    .gte("proxima_accion_at", r.desde)
    .lte("proxima_accion_at", r.hasta)
    .is("tipo_postventa", null)
    .or(filtroPalabras("proxima_accion"))
    .limit(1000);
  if (soloIds) qOps = qOps.in("comercial_id", soloIds);

  const qHist = supabase
    .from("actividades")
    .select("id, oportunidad_id, realizada_por, realizada_at, proxima_accion, proxima_accion_at, proxima_accion_hora")
    .gte("proxima_accion_at", r.desde)
    .lte("proxima_accion_at", r.hasta)
    .or(filtroPalabras("proxima_accion"))
    .limit(1000);

  let qTareas = supabase
    .from("tareas_agenda")
    .select("id, comercial_id, titulo, fecha, hora, completada")
    .gte("fecha", r.desde)
    .lte("fecha", r.hasta)
    .or(filtroPalabras("titulo"))
    .limit(500);
  if (soloIds) qTareas = qTareas.in("comercial_id", soloIds);

  const qPlanta = supabase
    .from("visitas_planta")
    .select("id, cuenta_id, oportunidad_id, empresa, motivo, fecha, hora, registrado_por, cancelada_at, cancelada_motivo, cerrada_at, no_vino_at, resultado, actividad_id")
    .gte("fecha", r.desde)
    .lte("fecha", r.hasta)
    .limit(500);

  const qGest = supabase
    .from("actividades")
    .select(
      `id, tipo, realizada_por, realizada_at, nota, oportunidad_id, catalogo_resultados_gestion(codigo, nombre), oportunidades(cuenta_id, tipo_postventa, ${CUENTA})`,
    )
    .in("tipo", ["visita", "showroom", "reunion_online"])
    .gte("realizada_at", g.ini)
    .lt("realizada_at", g.fin)
    .order("realizada_at")
    .limit(1000);

  const [{ data: ops }, { data: hist }, { data: tareas }, { data: planta }, { data: gest }] = await Promise.all([
    qOps,
    qHist,
    qTareas,
    qPlanta,
    qGest,
  ]);

  // La oportunidad de cada gestión que agendó: para saber si la visita sigue
  // en pie o la cambiaron por otra cosa, y de quién es la agenda.
  type Op = {
    id: string;
    cuenta_id: string | null;
    comercial_id: string | null;
    etapa: string;
    tipo_postventa: string | null;
    proxima_accion: string | null;
    proxima_accion_at: string | null;
    proxima_accion_hora: string | null;
    cuentas: CuentaEmb;
  };
  const opsPorId = new Map<string, Op>(((ops ?? []) as unknown as Op[]).map((o) => [o.id, o]));
  const faltan = [...new Set((hist ?? []).map((h) => h.oportunidad_id as string))].filter((id) => id && !opsPorId.has(id));
  for (const trozo of enTrozos(faltan)) {
    const { data } = await supabase
      .from("oportunidades")
      .select(`id, cuenta_id, comercial_id, etapa, tipo_postventa, proxima_accion, proxima_accion_at, proxima_accion_hora, ${CUENTA}`)
      .in("id", trozo);
    for (const o of (data ?? []) as unknown as Op[]) opsPorId.set(o.id, o);
  }

  const vigenteEn = (o: Op | undefined, texto: string, fecha: string) =>
    Boolean(o && !ETAPAS_CERRADAS.has(o.etapa) && o.proxima_accion === texto && o.proxima_accion_at && dia(o.proxima_accion_at) === fecha);

  const planes: PlanAgenda[] = [];
  for (const o of opsPorId.values()) {
    if (o.tipo_postventa || !o.proxima_accion || !o.proxima_accion_at || !o.comercial_id) continue;
    const f = dia(o.proxima_accion_at);
    if (f < r.desde || f > r.hasta) continue;
    planes.push({
      oportunidadId: o.id,
      cuentaId: o.cuenta_id,
      cliente: o.cuentas?.razon_social ?? "Cliente sin nombre",
      direccion: direccionDe(o.cuentas),
      comercialId: o.comercial_id,
      texto: o.proxima_accion,
      fecha: f,
      hora: hhmm(o.proxima_accion_hora),
      programadaAt: null,
      vigente: !ETAPAS_CERRADAS.has(o.etapa),
      accionActual: null,
      fechaActual: null,
    });
  }
  for (const h of hist ?? []) {
    const o = opsPorId.get(h.oportunidad_id as string);
    if (!o || o.tipo_postventa || !h.proxima_accion || !h.proxima_accion_at) continue;
    const f = dia(h.proxima_accion_at);
    const vigente = vigenteEn(o, h.proxima_accion as string, f);
    planes.push({
      oportunidadId: o.id,
      cuentaId: o.cuenta_id,
      cliente: o.cuentas?.razon_social ?? "Cliente sin nombre",
      direccion: direccionDe(o.cuentas),
      // La agenda es de quien tiene la oportunidad; si no tiene dueño, de quien la agendó.
      comercialId: o.comercial_id ?? (h.realizada_por as string),
      texto: h.proxima_accion as string,
      fecha: f,
      hora: hhmm(h.proxima_accion_hora),
      programadaAt: h.realizada_at as string,
      vigente,
      accionActual: vigente ? null : o.proxima_accion,
      fechaActual: vigente || !o.proxima_accion_at ? null : dia(o.proxima_accion_at),
    });
  }

  type G = {
    id: string;
    tipo: string;
    realizada_por: string;
    realizada_at: string;
    nota: string | null;
    oportunidad_id: string | null;
    catalogo_resultados_gestion: { codigo: string; nombre: string } | null;
    oportunidades: { cuenta_id: string | null; tipo_postventa: string | null; cuentas: CuentaEmb } | null;
  };
  const gestiones: GestionVisita[] = ((gest ?? []) as unknown as G[])
    .filter((x) => !x.oportunidades?.tipo_postventa && !(x.nota ?? "").startsWith("[Histórico"))
    .map((x) => {
      const { fecha, hora } = fechaHoraLima(x.realizada_at);
      return {
        id: x.id,
        tipo: x.tipo,
        comercialId: x.realizada_por,
        oportunidadId: x.oportunidad_id,
        cuentaId: x.oportunidades?.cuenta_id ?? null,
        cliente: x.oportunidades?.cuentas?.razon_social ?? "Cliente sin nombre",
        direccion: direccionDe(x.oportunidades?.cuentas ?? null),
        realizadaAt: x.realizada_at,
        fecha,
        hora,
        resultadoCodigo: x.catalogo_resultados_gestion?.codigo ?? null,
        resultadoNombre: x.catalogo_resultados_gestion?.nombre ?? null,
        nota: x.nota,
      };
    });

  const filasPlanta: VisitaPlantaFila[] = (planta ?? []).map((v) => ({
    id: v.id as string,
    comercialId: v.registrado_por as string,
    cuentaId: (v.cuenta_id as string | null) ?? null,
    oportunidadId: (v.oportunidad_id as string | null) ?? null,
    empresa: (v.empresa as string | null) ?? "Sin empresa",
    motivo: (v.motivo as string | null) ?? null,
    fecha: dia(v.fecha),
    hora: hhmm(v.hora),
    cancelada: Boolean(v.cancelada_at),
    canceladaMotivo: (v.cancelada_motivo as string | null) ?? null,
    cerrada: Boolean(v.cerrada_at),
    noVino: Boolean(v.no_vino_at),
    resultado: (v.resultado as string | null) ?? null,
    actividadId: (v.actividad_id as string | null) ?? null,
  }));
  // La gestión `showroom` de una visita a planta la firma quien la cerró, a
  // veces Central; la visita es de quien la registró (igual que en los
  // indicadores, contarVisitasYVideollamadas).
  const duenoPlanta = new Map(filasPlanta.filter((v) => v.actividadId).map((v) => [v.actividadId!, v.comercialId]));
  for (const x of gestiones) {
    const d = duenoPlanta.get(x.id);
    if (d) x.comercialId = d;
  }

  const lista = armarVisitasEquipo(
    {
      planes,
      tareas: (tareas ?? []).map((t) => ({
        id: t.id as string,
        comercialId: t.comercial_id as string,
        titulo: t.titulo as string,
        fecha: dia(t.fecha),
        hora: hhmm(t.hora),
        completada: Boolean(t.completada),
      })),
      planta: filasPlanta,
      gestiones,
    },
    r,
  );
  return soloIds ? lista.filter((v) => soloIds.includes(v.comercialId)) : lista;
}
