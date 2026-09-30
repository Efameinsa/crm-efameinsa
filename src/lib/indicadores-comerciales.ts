import type { createClient } from "@/lib/supabase/server";
import { esMarcaWhatsapp } from "@/lib/gestion-whatsapp";
import { lunesDe, sumarDias } from "@/lib/calendario";

/**
 * LOS INDICADORES DEL COMERCIAL, CADA UNO POR SU LADO (ing. Carlos, reunión
 * 30-09 12:35).
 *
 *  1. GESTIONES EFECTIVAS, SIN EL WHATSAPP DE CAMPAÑA. «No son seis gestiones
 *     sino seis WhatsApp… La idea es independizar. WhatsApp es una corrida.
 *     El otro es tu gestión.» Las marcas de un botón en los chats ya no suman
 *     a la meta (gestion-whatsapp.ts, WHATSAPP_CUENTA_PARA_META = false).
 *
 *  2. WHATSAPP DE CAMPAÑA, con su propio indicador: cuántos chats de anuncio
 *     le llegaron, cuántos calificó EL MISMO DÍA (meta 100 %) y en cuánto
 *     responde (meta 15 min). Medido con los datos del 21 al 29-09: a C4 le
 *     llegaron 48 chats y respondió en 82 min de mediana; a C2, 111 y 806 min.
 *     El resultado (interesados y cotizados) va al lado, sin meta: es lo que
 *     dice si la campaña sirvió.
 *
 *  3. VISITAS Y VIDEOLLAMADAS. «Dentro de todo lo que siempre medimos en la
 *     parte comercial son las visitas… ¿cuántas visitas hay el día de hoy?…
 *     Visitas y videollamadas. Ya te puse internet… haz tu videollamada.
 *     ¿Cuántas vas? No lo sé. Esos dos puntos tienen que estar en su reporte
 *     diario, reporte semanal, reporte mensual, todo… Son determinantes,
 *     entonces van a gestionar optimizando en eso.» En cinco semanas hubo 5
 *     visitas y 15 reuniones online en todo el equipo: son eventos de la
 *     semana, no del día, así que su meta es SEMANAL y el estado compara lo
 *     hecho contra lo que se esperaría a esta altura de la semana.
 *
 * Todo se calcula acá, en TypeScript, y no dentro de `supervision_diaria` ni
 * de `reporte_diario_comercial`: esas funciones sostienen los reportes de
 * todos los días y cada redefinición entera es apostarlos (criterio de la
 * casa, ver cierre-semanal.ts). Las funciones puras van arriba y tienen su
 * test; las que leen la base, abajo.
 */

// ─────────────────────────────────────────────────────────────────────────
// Metas
// ─────────────────────────────────────────────────────────────────────────

export interface MetasIndicadores {
  visitasSemana: number;
  videollamadasSemana: number;
  /** % de chats de anuncio calificados el mismo día. */
  waCalificadosPct: number;
  /** Mediana de primera respuesta, en minutos de horario laboral. */
  waRespuestaMin: number;
  /**
   * Desde cuándo visitas y videollamadas se juzgan con color. Antes de esa
   * fecha se miden y se muestran, pero el estado es neutro («En medición»):
   * no hay línea base (5 visitas en 5 semanas) y nadie debería amanecer en
   * rojo por una meta que se acaba de poner. YYYY-MM-DD.
   */
  visitasDesde: string;
}

/** Los valores de la migración 0353, por si la fila no está. */
export const METAS_POR_DEFECTO: MetasIndicadores = {
  visitasSemana: 2,
  videollamadasSemana: 5,
  waCalificadosPct: 100,
  waRespuestaMin: 15,
  visitasDesde: "2026-10-12",
};

export const CLAVES_METAS = [
  "meta_visitas_semana",
  "meta_videollamadas_semana",
  "meta_wa_tipificados_pct",
  "meta_wa_respuesta_min",
  "metas_visitas_desde",
] as const;

/**
 * `parametros.valor` es numérico: la fecha de `metas_visitas_desde` se guarda
 * como AAAAMMDD (20261012) para no cambiar el tipo de la tabla por una fila.
 */
export function fechaDeParametro(valor: number | null | undefined): string | null {
  if (!valor || !Number.isFinite(valor)) return null;
  const s = String(Math.trunc(valor));
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export function metasDeParametros(filas: { clave: string; valor: number | string | null }[] | null | undefined): MetasIndicadores {
  const v = (clave: string) => {
    const n = Number((filas ?? []).find((f) => f.clave === clave)?.valor);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    visitasSemana: v("meta_visitas_semana") ?? METAS_POR_DEFECTO.visitasSemana,
    videollamadasSemana: v("meta_videollamadas_semana") ?? METAS_POR_DEFECTO.videollamadasSemana,
    waCalificadosPct: v("meta_wa_tipificados_pct") ?? METAS_POR_DEFECTO.waCalificadosPct,
    waRespuestaMin: v("meta_wa_respuesta_min") ?? METAS_POR_DEFECTO.waRespuestaMin,
    visitasDesde: fechaDeParametro(v("metas_visitas_desde")) ?? METAS_POR_DEFECTO.visitasDesde,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Horario laboral (hora de Lima, UTC−5 todo el año, sin horario de verano)
// ─────────────────────────────────────────────────────────────────────────

const MIN = 60_000;
const OFFSET_LIMA_MIN = 5 * 60;

/** Minutos desde la medianoche de Lima: [abre, cierra) por día de la semana (0 = domingo). */
export const HORARIO_LABORAL: Record<number, readonly [number, number] | null> = {
  0: null,
  1: [8 * 60 + 30, 18 * 60],
  2: [8 * 60 + 30, 18 * 60],
  3: [8 * 60 + 30, 18 * 60],
  4: [8 * 60 + 30, 18 * 60],
  5: [8 * 60 + 30, 18 * 60],
  6: [8 * 60 + 30, 13 * 60],
};

/** El día de calendario de Lima de un instante. */
export function diaLima(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  return new Date(t - OFFSET_LIMA_MIN * MIN).toISOString().slice(0, 10);
}

function diaSemana(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** ¿Ese instante cae dentro del horario de atención (L-V 08:30-18:00, S 08:30-13:00)? */
export function enHorarioLaboral(d: Date | string): boolean {
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const local = new Date(t - OFFSET_LIMA_MIN * MIN);
  const ventana = HORARIO_LABORAL[local.getUTCDay()];
  if (!ventana) return false;
  const m = local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60;
  return m >= ventana[0] && m < ventana[1];
}

/**
 * Minutos de horario laboral entre dos instantes. El reloj solo corre con la
 * oficina abierta: un mensaje de las 17:55 respondido a las 08:35 del día
 * siguiente son 10 minutos, no 14 horas. Sin feriados (no hay calendario de
 * feriados en el CRM); si alguno pesa, se verá como un día largo.
 */
export function minutosHabiles(desde: Date | string, hasta: Date | string): number {
  const a = typeof desde === "string" ? new Date(desde).getTime() : desde.getTime();
  const b = typeof hasta === "string" ? new Date(hasta).getTime() : hasta.getTime();
  if (!(b > a)) return 0;
  let total = 0;
  let dia = diaLima(new Date(a));
  const ultimo = diaLima(new Date(b));
  for (let i = 0; i < 400 && dia <= ultimo; i++, dia = sumarDias(dia, 1)) {
    const ventana = HORARIO_LABORAL[diaSemana(dia)];
    if (!ventana) continue;
    const base = new Date(`${dia}T00:00:00Z`).getTime() + OFFSET_LIMA_MIN * MIN;
    const abre = base + ventana[0] * MIN;
    const cierra = base + ventana[1] * MIN;
    total += Math.max(0, Math.min(cierra, b) - Math.max(abre, a));
  }
  return total / MIN;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((x, y) => x - y);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// ─────────────────────────────────────────────────────────────────────────
// Estado contra la meta
// ─────────────────────────────────────────────────────────────────────────

export type EstadoIndicador = "en_meta" | "en_camino" | "atrasado" | "en_medicion" | "sin_meta";

export interface Evaluacion {
  estado: EstadoIndicador;
  /** La frase del estado, con números: el color solo no alcanza (impresión en B/N, daltonismo). */
  texto: string;
}

/** Días hábiles para visitas y videollamadas: lunes a viernes. */
function esDiaHabil(iso: string): boolean {
  const d = diaSemana(iso);
  return d >= 1 && d <= 5;
}

/**
 * Qué parte de la meta se esperaría cumplida AL EMPEZAR `hoy`, dentro del
 * período [desde, hasta]. Cuenta los días hábiles (L-V) ya terminados: el
 * lunes, 0; el jueves, 3 de 5 = 60 %; el sábado, 100 %. El día en curso no se
 * cuenta —la visita de la tarde todavía puede pasar—. Un período que ya
 * terminó espera el 100 %.
 */
export function ritmoEsperado(desde: string, hasta: string, hoy: string): number {
  if (hoy > hasta) return 1;
  if (hoy <= desde) return 0;
  let total = 0;
  let hechos = 0;
  for (let d = desde, i = 0; d <= hasta && i < 400; d = sumarDias(d, 1), i++) {
    if (!esDiaHabil(d)) continue;
    total++;
    if (d < hoy) hechos++;
  }
  return total === 0 ? 1 : hechos / total;
}

/** Cuántos días en un período, para escalar una meta semanal a un mes. */
export function metaDelPeriodo(metaSemanal: number, desde: string, hasta: string): number {
  const dias = Math.round((new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  if (dias <= 7) return metaSemanal;
  return Math.max(1, Math.round((metaSemanal * dias) / 7));
}

const fechaCorta = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

/**
 * El estado de un conteo contra su meta del período. Las palabras las pidió
 * el coordinador de la propuesta (30-09): «Atrasado: van 1, se esperaban 3».
 */
export function evaluarConteo({
  hecho,
  meta,
  ritmo,
  enMedicionHasta,
}: {
  hecho: number;
  meta: number;
  /** 0 a 1, de `ritmoEsperado`. */
  ritmo: number;
  /** Si viene, todavía no se juzga con ámbar ni rojo: fecha YYYY-MM-DD en que empieza. */
  enMedicionHasta?: string | null;
}): Evaluacion {
  if (!meta || meta <= 0) return { estado: "sin_meta", texto: "Sin meta cargada" };
  if (hecho >= meta) return { estado: "en_meta", texto: `En meta: ${hecho} de ${meta}` };
  if (enMedicionHasta) return { estado: "en_medicion", texto: `En medición hasta el ${fechaCorta(enMedicionHasta)}` };
  const esperado = Math.floor(meta * ritmo + 1e-9);
  if (ritmo >= 1) {
    const falta = meta - hecho;
    return { estado: "atrasado", texto: `No llegó: ${hecho} de ${meta}, faltó ${falta}` };
  }
  if (hecho >= esperado) {
    return {
      estado: "en_camino",
      texto: esperado === 0 ? `En camino: van ${hecho} de ${meta}` : `En camino: van ${hecho}, se esperaban ${esperado}`,
    };
  }
  return { estado: "atrasado", texto: `Atrasado: van ${hecho}, se esperaban ${esperado}` };
}

// ─────────────────────────────────────────────────────────────────────────
// Gestiones efectivas (sin el WhatsApp de campaña)
// ─────────────────────────────────────────────────────────────────────────

/** Los tipos que cuentan para la meta: el mismo criterio que `supervision_diaria` (0090, 0307). */
export const TIPOS_GESTION_META = ["llamada", "whatsapp", "email", "visita", "reunion_online"] as const;

export interface ActividadGestion {
  tipo: string;
  nota: string | null;
  /** Sin resultado, o con uno distinto de «No contestó». */
  efectiva: boolean;
  /** La oportunidad es un caso de postventa: no compite en la meta de venta. */
  postventa: boolean;
}

export interface ConteoGestiones {
  efectivas: number;
  sinContacto: number;
  /** Marcas de un botón en los chats: aparte, no suman. */
  marcasWhatsapp: number;
}

export function contarGestiones(filas: ActividadGestion[]): ConteoGestiones {
  const r: ConteoGestiones = { efectivas: 0, sinContacto: 0, marcasWhatsapp: 0 };
  for (const a of filas) {
    if (!(TIPOS_GESTION_META as readonly string[]).includes(a.tipo)) continue;
    if (esMarcaWhatsapp(a.tipo, a.nota)) {
      r.marcasWhatsapp++;
      continue;
    }
    if (a.postventa) continue;
    if (a.efectiva) r.efectivas++;
    else r.sinContacto++;
  }
  return r;
}

// ─────────────────────────────────────────────────────────────────────────
// Visitas y videollamadas
// ─────────────────────────────────────────────────────────────────────────

export interface ActividadVisita {
  id: string;
  tipo: string;
  realizada_por: string;
  efectiva: boolean;
}

/** La visita a planta (0256) cerrada con resultado: dejó una gestión `showroom`. */
export interface VisitaPlantaCerrada {
  actividad_id: string;
  registrado_por: string;
}

export interface ConteoVisitas {
  /** El comercial fue donde el cliente (gestión «Visita»). */
  visitasCliente: number;
  /** El cliente vino a la planta o al showroom. */
  visitasPlanta: number;
  visitas: number;
  videollamadas: number;
}

export const CONTEO_VACIO: ConteoVisitas = { visitasCliente: 0, visitasPlanta: 0, visitas: 0, videollamadas: 0 };

/**
 * Visitas y videollamadas por comercial.
 *
 * SIN DOBLE CONTEO: la visita a planta, al cerrarse, escribe UNA gestión
 * `showroom` (0256). Se cuentan las gestiones, no las visitas de la tabla,
 * así que cada visita entra una sola vez. Lo único que se corrige es DE QUIÉN
 * es: la gestión la firma quien cerró la visita, que a veces es Central; si
 * la visita la registró un comercial, se le cuenta a él.
 *
 * Solo cuenta lo efectivo: una «Visita» con resultado «No contestó» es un
 * viaje en falso, no una visita; una videollamada que no se conectó, tampoco.
 */
export function contarVisitasYVideollamadas(
  actividades: ActividadVisita[],
  visitasPlanta: VisitaPlantaCerrada[],
  ids: Iterable<string>,
): Map<string, ConteoVisitas> {
  const r = new Map<string, ConteoVisitas>();
  for (const id of ids) r.set(id, { ...CONTEO_VACIO });
  const duenoPlanta = new Map(visitasPlanta.map((v) => [v.actividad_id, v.registrado_por]));
  for (const a of actividades) {
    if (!a.efectiva) continue;
    let quien = a.realizada_por;
    if (a.tipo === "showroom") {
      const registro = duenoPlanta.get(a.id);
      if (registro && r.has(registro)) quien = registro;
    }
    const c = r.get(quien);
    if (!c) continue;
    if (a.tipo === "visita") c.visitasCliente++;
    else if (a.tipo === "showroom") c.visitasPlanta++;
    else if (a.tipo === "reunion_online") c.videollamadas++;
    c.visitas = c.visitasCliente + c.visitasPlanta;
  }
  return r;
}

// ─────────────────────────────────────────────────────────────────────────
// WhatsApp de campaña
// ─────────────────────────────────────────────────────────────────────────

export interface ChatAnuncio {
  id: string;
  asignado_a: string | null;
  lead_id: string | null;
  /** Cuándo llegó por el anuncio (0265; si volvió a entrar por otro, la última vez). */
  anuncio_at: string;
}

export interface MensajeChat {
  conversacion_id: string;
  direccion: "entrante" | "saliente" | string;
  /** Null = lo mandó el número solo (el acuse, la ficha de un botón): no es respuesta de nadie. */
  enviado_por: string | null;
  estado: string | null;
  momento: string;
}

export interface TipificacionChat {
  lead_id: string;
  estado: string;
  registrado_at: string;
}

export interface ResumenWhatsapp {
  chats: number;
  /** Calificados (tipificados) el mismo día en que llegaron. La meta. */
  calificadosMismoDia: number;
  /** Calificados alguna vez después de llegar. */
  calificados: number;
  /** Mediana de minutos hábiles hasta la primera respuesta de una persona. */
  medianaRespuestaMin: number | null;
  /** Chats que entran a la mediana (respondidos, y los que esperan si se pasó `ahora`). */
  medidos: number;
  /** Llegaron fuera de horario: su reloj empezó al abrir la oficina. */
  fueraDeHorario: number;
  /** Nadie le escribió todavía (ni dentro ni fuera de horario). */
  sinResponder: number;
  interesados: number;
  cotizados: number;
}

export const WHATSAPP_VACIO: ResumenWhatsapp = {
  chats: 0,
  calificadosMismoDia: 0,
  calificados: 0,
  medianaRespuestaMin: null,
  medidos: 0,
  fueraDeHorario: 0,
  sinResponder: 0,
  interesados: 0,
  cotizados: 0,
};

/** Un minuto de gracia: el mensaje del anuncio y `anuncio_at` salen del mismo timestamp de Meta. */
const GRACIA_MS = 60_000;

/**
 * El WhatsApp de campaña de cada comercial.
 *
 * PRIMERA RESPUESTA: desde el primer mensaje del cliente que trajo el anuncio
 * hasta el primer mensaje que escribió una PERSONA (`enviado_por` no nulo y no
 * fallido). El acuse automático no cuenta: lo manda el número a los dos
 * segundos y haría que todos respondan en 0 min. El reloj solo corre en
 * horario de oficina (L-V 08:30-18:00, S 08:30-13:00): el que escribe a las
 * 17:55 y recibe respuesta a las 08:35 esperó 10 minutos; el que escribe a las
 * 05:44 empieza a esperar a las 08:30.
 *
 * LOS QUE NADIE RESPONDIÓ TAMBIÉN CUENTAN. Si se midieran solo los
 * respondidos, el comercial que deja 30 chats sin contestar tendría una
 * mediana perfecta (medido el 30-09 con C2: 30 chats de anuncio a mediodía,
 * ninguno respondido). Con `ahora`, un chat sin respuesta entra con lo que
 * lleva esperando: es lo mínimo que va a tardar.
 *
 * CALIFICADO: tiene una tipificación (interesado, cotizado, no contesta…)
 * registrada después de que llegó. La meta es el mismo día.
 *
 * RESULTADO: interesados = marcados «interesado» o «cotizado»; cotizados =
 * marcados «cotizado». Un cotizado también estuvo interesado.
 */
export function resumirWhatsappCampania(
  chats: ChatAnuncio[],
  mensajes: MensajeChat[],
  tipificaciones: TipificacionChat[],
  ids: Iterable<string>,
  /** El momento de la consulta: los chats sin respuesta entran con lo que llevan esperando. */
  ahora?: string | null,
): Map<string, ResumenWhatsapp> {
  const porChat = new Map<string, MensajeChat[]>();
  for (const m of mensajes) {
    const l = porChat.get(m.conversacion_id) ?? [];
    l.push(m);
    porChat.set(m.conversacion_id, l);
  }
  const porLead = new Map<string, TipificacionChat[]>();
  for (const t of tipificaciones) {
    const l = porLead.get(t.lead_id) ?? [];
    l.push(t);
    porLead.set(t.lead_id, l);
  }

  const tiempos = new Map<string, number[]>();
  const r = new Map<string, ResumenWhatsapp>();
  for (const id of ids) {
    r.set(id, { ...WHATSAPP_VACIO });
    tiempos.set(id, []);
  }

  for (const c of chats) {
    if (!c.asignado_a) continue;
    const s = r.get(c.asignado_a);
    if (!s) continue;
    s.chats++;
    const llego = new Date(c.anuncio_at).getTime();
    const diaLlego = diaLima(c.anuncio_at);

    const tips = (c.lead_id ? (porLead.get(c.lead_id) ?? []) : []).filter((t) => new Date(t.registrado_at).getTime() >= llego - GRACIA_MS);
    if (tips.length > 0) s.calificados++;
    if (tips.some((t) => diaLima(t.registrado_at) === diaLlego)) s.calificadosMismoDia++;
    if (tips.some((t) => t.estado === "interesado" || t.estado === "cotizado")) s.interesados++;
    if (tips.some((t) => t.estado === "cotizado")) s.cotizados++;

    const ms = (porChat.get(c.id) ?? [])
      .filter((m) => new Date(m.momento).getTime() >= llego - GRACIA_MS)
      .sort((a, b) => a.momento.localeCompare(b.momento));
    const primero = ms.find((m) => m.direccion === "entrante");
    const respuesta = primero
      ? ms.find((m) => m.direccion === "saliente" && m.enviado_por && m.estado !== "fallido" && m.momento >= primero.momento)
      : ms.find((m) => m.direccion === "saliente" && m.enviado_por && m.estado !== "fallido");
    if (!respuesta) s.sinResponder++;
    if (!primero) continue;
    if (!enHorarioLaboral(primero.momento)) s.fueraDeHorario++;
    const hasta = respuesta?.momento ?? ahora ?? null;
    if (!hasta) continue;
    s.medidos++;
    tiempos.get(c.asignado_a)!.push(minutosHabiles(primero.momento, hasta));
  }
  for (const [id, s] of r) {
    const m = mediana(tiempos.get(id) ?? []);
    s.medianaRespuestaMin = m === null ? null : Math.round(m);
  }
  return r;
}

/**
 * El estado del WhatsApp de campaña. Null si no le llegó ningún chat de
 * anuncio: nadie en rojo porque no le tocaron campañas (coordinador, 30-09).
 */
export function evaluarWhatsapp(
  w: ResumenWhatsapp,
  metas: Pick<MetasIndicadores, "waCalificadosPct" | "waRespuestaMin">,
  diaEnCurso: boolean,
): Evaluacion | null {
  if (w.chats === 0) return null;
  const pct = Math.round((w.calificadosMismoDia / w.chats) * 100);
  const calificaOk = pct >= metas.waCalificadosPct;
  const respondeOk = w.medianaRespuestaMin === null || w.medianaRespuestaMin <= metas.waRespuestaMin;
  if (calificaOk && respondeOk) return { estado: "en_meta", texto: "En meta" };
  const faltas: string[] = [];
  if (!calificaOk) faltas.push(`calificó ${w.calificadosMismoDia} de ${w.chats} el mismo día`);
  if (!respondeOk) faltas.push(`responde en ${w.medianaRespuestaMin} min (meta ${metas.waRespuestaMin})`);
  if (w.sinResponder > 0) faltas.push(`${w.sinResponder} sin responder`);
  // El día en curso: los chats sin calificar todavía pueden calificarse hoy.
  if (diaEnCurso && respondeOk) return { estado: "en_camino", texto: `En camino: faltan calificar ${w.chats - w.calificadosMismoDia}` };
  return { estado: "atrasado", texto: `Atrasado: ${faltas.join("; ")}` };
}

// ─────────────────────────────────────────────────────────────────────────
// Lectura de la base
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

export async function cargarMetasIndicadores(supabase: Cliente): Promise<MetasIndicadores> {
  const { data } = await supabase.from("parametros").select("clave, valor").in("clave", [...CLAVES_METAS]);
  return metasDeParametros(data as { clave: string; valor: number }[] | null);
}

export async function cargarGestionesEfectivas(
  supabase: Cliente,
  ids: string[],
  desde: string,
  hasta: string,
): Promise<Map<string, ConteoGestiones>> {
  const r = new Map<string, ConteoGestiones>(ids.map((id) => [id, { efectivas: 0, sinContacto: 0, marcasWhatsapp: 0 }]));
  if (ids.length === 0) return r;
  const { ini, fin } = rangoLima(desde, hasta);
  const filas: { realizada_por: string; tipo: string; nota: string | null; catalogo_resultados_gestion: unknown; oportunidades: unknown }[] = [];
  for (let desdeFila = 0; desdeFila < 20_000; desdeFila += 1000) {
    const { data } = await supabase
      .from("actividades")
      .select("realizada_por, tipo, nota, catalogo_resultados_gestion(codigo), oportunidades(tipo_postventa)")
      .in("realizada_por", ids)
      .in("tipo", [...TIPOS_GESTION_META])
      .gte("realizada_at", ini)
      .lt("realizada_at", fin)
      .order("realizada_at")
      .range(desdeFila, desdeFila + 999);
    filas.push(...((data ?? []) as typeof filas));
    if ((data ?? []).length < 1000) break;
  }
  const porPersona = new Map<string, ActividadGestion[]>();
  for (const f of filas) {
    const l = porPersona.get(f.realizada_por) ?? [];
    l.push({
      tipo: f.tipo,
      nota: f.nota,
      efectiva: (f.catalogo_resultados_gestion as { codigo: string } | null)?.codigo !== "NO_CONTESTO",
      postventa: Boolean((f.oportunidades as { tipo_postventa: string | null } | null)?.tipo_postventa),
    });
    porPersona.set(f.realizada_por, l);
  }
  for (const [id, l] of porPersona) r.set(id, contarGestiones(l));
  return r;
}

export async function cargarVisitas(supabase: Cliente, ids: string[], desde: string, hasta: string): Promise<Map<string, ConteoVisitas>> {
  if (ids.length === 0) return new Map();
  const { ini, fin } = rangoLima(desde, hasta);
  // Por fecha y no por persona: la visita a planta la puede firmar Central
  // (ver contarVisitasYVideollamadas). Son pocas filas: 20 en cinco semanas.
  const { data: acts } = await supabase
    .from("actividades")
    .select("id, tipo, realizada_por, catalogo_resultados_gestion(codigo)")
    .in("tipo", ["visita", "showroom", "reunion_online"])
    .gte("realizada_at", ini)
    .lt("realizada_at", fin)
    .limit(1000);
  const actividades: ActividadVisita[] = (acts ?? []).map((a) => ({
    id: a.id as string,
    tipo: a.tipo as string,
    realizada_por: a.realizada_por as string,
    efectiva: (a.catalogo_resultados_gestion as unknown as { codigo: string } | null)?.codigo !== "NO_CONTESTO",
  }));
  const showrooms = actividades.filter((a) => a.tipo === "showroom").map((a) => a.id);
  const planta: VisitaPlantaCerrada[] = [];
  for (const trozo of enTrozos(showrooms)) {
    const { data } = await supabase.from("visitas_planta").select("actividad_id, registrado_por").in("actividad_id", trozo);
    planta.push(...((data ?? []) as VisitaPlantaCerrada[]));
  }
  return contarVisitasYVideollamadas(actividades, planta, ids);
}

export async function cargarWhatsappCampania(
  supabase: Cliente,
  ids: string[],
  desde: string,
  hasta: string,
): Promise<Map<string, ResumenWhatsapp>> {
  if (ids.length === 0) return new Map();
  const { ini, fin } = rangoLima(desde, hasta);
  // «Vino de un anuncio»: trae el referral de Meta, su clic (ctwa_clid) o el
  // código de campaña del mensaje prellenado.
  const { data: chatsData } = await supabase
    .from("wa_conversaciones")
    .select("id, asignado_a, lead_id, anuncio_at, created_at")
    .in("asignado_a", ids)
    .or("referral.not.is.null,ctwa_clid.not.is.null,codigo_campania_wa.not.is.null")
    .gte("anuncio_at", ini)
    .lt("anuncio_at", fin)
    .limit(2000);
  const chats: ChatAnuncio[] = (chatsData ?? []).map((c) => ({
    id: c.id as string,
    asignado_a: c.asignado_a as string | null,
    lead_id: c.lead_id as string | null,
    anuncio_at: (c.anuncio_at ?? c.created_at) as string,
  }));
  if (chats.length === 0) return resumirWhatsappCampania([], [], [], ids);

  const mensajes: MensajeChat[] = [];
  const tipificaciones: TipificacionChat[] = [];
  const leads = [...new Set(chats.map((c) => c.lead_id).filter((x): x is string => !!x))];
  await Promise.all([
    ...enTrozos(chats.map((c) => c.id)).map(async (trozo) => {
      for (let desdeFila = 0; desdeFila < 20_000; desdeFila += 1000) {
        const { data } = await supabase
          .from("wa_mensajes")
          .select("conversacion_id, direccion, enviado_por, estado, timestamp_meta, created_at")
          .in("conversacion_id", trozo)
          .gte("created_at", new Date(new Date(ini).getTime() - 86_400_000).toISOString())
          .order("created_at")
          .range(desdeFila, desdeFila + 999);
        for (const m of data ?? []) {
          mensajes.push({
            conversacion_id: m.conversacion_id as string,
            direccion: m.direccion as string,
            enviado_por: m.enviado_por as string | null,
            estado: m.estado as string | null,
            momento: (m.timestamp_meta ?? m.created_at) as string,
          });
        }
        if ((data ?? []).length < 1000) break;
      }
    }),
    ...enTrozos(leads).map(async (trozo) => {
      const { data } = await supabase.from("tipificaciones_whatsapp").select("lead_id, estado, registrado_at").in("lead_id", trozo).limit(2000);
      tipificaciones.push(...((data ?? []) as TipificacionChat[]));
    }),
  ]);
  return resumirWhatsappCampania(chats, mensajes, tipificaciones, ids, new Date().toISOString());
}

// ─────────────────────────────────────────────────────────────────────────
// El paquete que dibujan las pantallas y los PDF
// ─────────────────────────────────────────────────────────────────────────

export interface IndicadoresComercial {
  id: string;
  /** Null cuando la pantalla ya tiene su propio número de gestiones (Control). */
  gestiones: ConteoGestiones | null;
  whatsapp: ResumenWhatsapp;
  /** Visitas y videollamadas del período (la semana, en las vistas del día). */
  periodo: ConteoVisitas;
  /** Las del día `hasta`, para «¿cuántas visitas hay hoy?». */
  dia: ConteoVisitas;
  /** El período anterior del mismo largo, para comparar en chico. */
  anterior: ConteoVisitas;
}

export interface IndicadoresEquipo {
  /** Rango de visitas y videollamadas (lunes a la fecha, o el período pedido). */
  desde: string;
  hasta: string;
  /** Rango del WhatsApp de campaña: el día, o el período entero. */
  waDesde: string;
  waHasta: string;
  hoy: string;
  metas: MetasIndicadores;
  metaVisitas: number;
  metaVideollamadas: number;
  ritmo: number;
  enMedicionHasta: string | null;
  porComercial: Map<string, IndicadoresComercial>;
}

/**
 * Para las vistas de UN DÍA (Control, inicio del comercial, reporte diario):
 * el WhatsApp de ese día, y visitas y videollamadas de la semana que va del
 * lunes a ese día, contra la semana anterior entera.
 */
export async function cargarIndicadoresDelDia(
  supabase: Cliente,
  ids: string[],
  fecha: string,
  hoy: string,
  opciones: { conGestiones?: boolean } = {},
): Promise<IndicadoresEquipo> {
  const lunes = lunesDe(fecha);
  const sabado = sumarDias(lunes, 5);
  return cargarIndicadores(supabase, ids, {
    desde: lunes,
    hasta: fecha,
    finPeriodo: sabado,
    waDesde: fecha,
    waHasta: fecha,
    anteriorDesde: sumarDias(lunes, -7),
    anteriorHasta: sumarDias(lunes, -2),
    diaDesde: fecha,
    hoy,
    conGestiones: opciones.conGestiones ?? false,
  });
}

/** Para las vistas de un PERÍODO (cierre semanal, mes, Mi gestión con filtro). */
export async function cargarIndicadoresDelPeriodo(
  supabase: Cliente,
  ids: string[],
  desde: string,
  hasta: string,
  hoy: string,
  opciones: { conGestiones?: boolean } = {},
): Promise<IndicadoresEquipo> {
  const dias = Math.round((new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  const hastaReal = hoy < hasta ? hoy : hasta;
  // La semana se compara con la semana anterior (lunes con lunes), no con los
  // seis días que la preceden.
  const salto = dias <= 7 ? 7 : dias;
  return cargarIndicadores(supabase, ids, {
    desde,
    hasta: hastaReal < desde ? desde : hastaReal,
    finPeriodo: hasta,
    waDesde: desde,
    waHasta: hastaReal < desde ? desde : hastaReal,
    anteriorDesde: sumarDias(desde, -salto),
    anteriorHasta: sumarDias(desde, -salto + dias - 1),
    diaDesde: hastaReal < desde ? desde : hastaReal,
    hoy,
    conGestiones: opciones.conGestiones ?? false,
  });
}

async function cargarIndicadores(
  supabase: Cliente,
  ids: string[],
  r: {
    desde: string;
    hasta: string;
    finPeriodo: string;
    waDesde: string;
    waHasta: string;
    anteriorDesde: string;
    anteriorHasta: string;
    diaDesde: string;
    hoy: string;
    conGestiones: boolean;
  },
): Promise<IndicadoresEquipo> {
  const [metas, periodo, anterior, whatsapp, gestiones] = await Promise.all([
    cargarMetasIndicadores(supabase),
    cargarVisitas(supabase, ids, r.desde, r.hasta),
    cargarVisitas(supabase, ids, r.anteriorDesde, r.anteriorHasta),
    cargarWhatsappCampania(supabase, ids, r.waDesde, r.waHasta),
    r.conGestiones ? cargarGestionesEfectivas(supabase, ids, r.waDesde, r.waHasta) : Promise.resolve(null),
  ]);
  const dia = r.diaDesde === r.desde && r.desde === r.hasta ? periodo : await cargarVisitas(supabase, ids, r.diaDesde, r.diaDesde);
  const porComercial = new Map<string, IndicadoresComercial>();
  for (const id of ids) {
    porComercial.set(id, {
      id,
      gestiones: gestiones?.get(id) ?? null,
      whatsapp: whatsapp.get(id) ?? { ...WHATSAPP_VACIO },
      periodo: periodo.get(id) ?? { ...CONTEO_VACIO },
      dia: dia.get(id) ?? { ...CONTEO_VACIO },
      anterior: anterior.get(id) ?? { ...CONTEO_VACIO },
    });
  }
  return {
    desde: r.desde,
    hasta: r.finPeriodo,
    waDesde: r.waDesde,
    waHasta: r.waHasta,
    hoy: r.hoy,
    metas,
    metaVisitas: metaDelPeriodo(metas.visitasSemana, r.desde, r.finPeriodo),
    metaVideollamadas: metaDelPeriodo(metas.videollamadasSemana, r.desde, r.finPeriodo),
    // Mirando un día pasado, se juzga como quedó AL CIERRE de ese día; mirando
    // hoy, sin contar hoy (lo de la tarde todavía puede pasar).
    ritmo: ritmoEsperado(r.desde, r.finPeriodo, r.hasta < r.hoy ? sumarDias(r.hasta, 1) : r.hoy),
    enMedicionHasta: r.hasta < metas.visitasDesde ? metas.visitasDesde : null,
    porComercial,
  };
}

/** Los estados de visitas y videollamadas de un comercial, con la regla del período. */
export function evaluarVisitas(eq: IndicadoresEquipo, c: IndicadoresComercial): { visitas: Evaluacion; videollamadas: Evaluacion } {
  return {
    visitas: evaluarConteo({ hecho: c.periodo.visitas, meta: eq.metaVisitas, ritmo: eq.ritmo, enMedicionHasta: eq.enMedicionHasta }),
    videollamadas: evaluarConteo({
      hecho: c.periodo.videollamadas,
      meta: eq.metaVideollamadas,
      ritmo: eq.ritmo,
      enMedicionHasta: eq.enMedicionHasta,
    }),
  };
}

/** «¿Está mirando el día que todavía no termina?» — para no llamar atrasado a lo que aún puede pasar hoy. */
export function esDiaEnCurso(eq: IndicadoresEquipo): boolean {
  return eq.waHasta >= eq.hoy;
}

/** Lo que llevan los documentos (reporte diario, cierre semanal, cierre del mes): datos planos, ya evaluados. */
export interface IndicadoresDocumento {
  whatsapp: ResumenWhatsapp;
  whatsappEstado: Evaluacion | null;
  metas: { calificadosPct: number; respuestaMin: number };
  visitas: ConteoDocumento;
  videollamadas: ConteoDocumento;
}

export interface ConteoDocumento {
  hecho: number;
  meta: number;
  /** Las del último día del rango (en el reporte diario, «hoy»). */
  hoy: number;
  anterior: number;
  estado: Evaluacion;
}

export function indicadoresParaDocumento(eq: IndicadoresEquipo, id: string): IndicadoresDocumento | null {
  const c = eq.porComercial.get(id);
  if (!c) return null;
  const ev = evaluarVisitas(eq, c);
  return {
    whatsapp: c.whatsapp,
    whatsappEstado: evaluarWhatsapp(c.whatsapp, eq.metas, esDiaEnCurso(eq)),
    metas: { calificadosPct: eq.metas.waCalificadosPct, respuestaMin: eq.metas.waRespuestaMin },
    visitas: { hecho: c.periodo.visitas, meta: eq.metaVisitas, hoy: c.dia.visitas, anterior: c.anterior.visitas, estado: ev.visitas },
    videollamadas: {
      hecho: c.periodo.videollamadas,
      meta: eq.metaVideollamadas,
      hoy: c.dia.videollamadas,
      anterior: c.anterior.videollamadas,
      estado: ev.videollamadas,
    },
  };
}

/**
 * ¿Quiénes venden de verdad? Los que hicieron al menos una gestión de contacto
 * sobre un expediente de venta en los últimos 30 días. Criterio de datos y no
 * una lista de códigos (coordinador, 30-09): hoy deja fuera al Almacén y a
 * C3/C6, que no tienen gestión; cuando alguien empiece a vender, entra solo.
 * Postventa y las cuentas de práctica se filtran antes, por su perfil.
 */
export async function idsQueVenden(supabase: Cliente, ids: string[], hoy: string): Promise<Set<string>> {
  const desde = `${sumarDias(hoy, -29)}T00:00:00-05:00`;
  const pares = await Promise.all(
    ids.map(async (id) => {
      const { data } = await supabase
        .from("actividades")
        .select("id, oportunidades!inner(tipo_postventa)")
        .eq("realizada_por", id)
        .in("tipo", [...TIPOS_GESTION_META])
        .is("oportunidades.tipo_postventa", null)
        .gte("realizada_at", desde)
        .limit(1);
      return [id, (data ?? []).length > 0] as const;
    }),
  );
  return new Set(pares.filter(([, vende]) => vende).map(([id]) => id));
}
