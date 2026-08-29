// Rango de fechas de los paneles de gerencia, resuelto SIEMPRE en hora de
// Lima. Vercel corre en UTC: `new Date().getDate()` a las 8 pm de Lima ya es
// "mañana" en el servidor, y "este mes" el día 31 a la noche daba el mes
// siguiente vacío. Todo lo que dependa de "hoy" pasa por acá.

import { lunesDe } from "@/lib/calendario";

const ZONA = "America/Lima";

export interface Periodo {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}

/**
 * La semana va PRIMERO, y no por orden alfabético.
 *
 * Pedido de Darwin (28-08): «cada semana es importante, más importante que
 * mensual o período», para comerciales y para gerencia. La empresa ya vive en
 * semanas —los potenciales se proyectan por semana y el cierre se hace el
 * sábado (`cierre-semanal.ts`)—, así que el filtro de los paneles tenía que
 * hablar el mismo idioma. La semana empieza el LUNES, igual que en
 * `calendario.ts`: de ahí sale `lunesDe`, para no tener dos aritméticas que se
 * separen con el tiempo.
 */
export type PresetPeriodo = "semana" | "semana_anterior" | "mes" | "mes_anterior" | "30d" | "90d" | "anio" | "12m" | "todo";

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" de hoy en Lima. */
export function hoyLima(): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function inicioMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
function finMes(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)); // día 0 del mes siguiente = último del actual
  return d.toISOString().slice(0, 10);
}

export function periodoPreset(preset: PresetPeriodo, hoy = hoyLima()): Periodo {
  switch (preset) {
    case "semana":
      return { desde: lunesDe(hoy), hasta: hoy };
    case "semana_anterior": {
      const lunesPasado = sumarDias(lunesDe(hoy), -7);
      // Hasta el domingo, no hasta el sábado: en Efameinsa la semana laboral
      // termina el sábado, pero si alguien registró algo un domingo —una
      // gestión desde el celular— cortar el viernes/sábado lo escondería.
      return { desde: lunesPasado, hasta: sumarDias(lunesPasado, 6) };
    }
    case "mes":
      return { desde: inicioMes(hoy), hasta: hoy };
    case "mes_anterior": {
      const ultimoDiaAnterior = sumarDias(inicioMes(hoy), -1);
      return { desde: inicioMes(ultimoDiaAnterior), hasta: finMes(ultimoDiaAnterior) };
    }
    case "30d":
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    case "90d":
      return { desde: sumarDias(hoy, -89), hasta: hoy };
    case "anio":
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
    case "12m": {
      const [y, m] = hoy.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 - 11, 1));
      return { desde: d.toISOString().slice(0, 10), hasta: hoy };
    }
    case "todo":
      return { desde: "2018-01-01", hasta: hoy };
  }
}

/**
 * En orden de prioridad: si un rango coincide con dos presets (un lunes 1 de
 * mes es a la vez «esta semana» y «este mes»), gana el primero de la lista.
 */
const TODOS_LOS_PRESETS: PresetPeriodo[] = [
  "semana",
  "semana_anterior",
  "mes",
  "mes_anterior",
  "30d",
  "90d",
  "anio",
  "12m",
  "todo",
];

/** Lee ?desde&hasta de la URL; si faltan o están mal, cae al preset dado. */
export function resolverPeriodo(
  sp: { desde?: string; hasta?: string },
  porDefecto: PresetPeriodo = "mes",
): Periodo & { preset: PresetPeriodo | null } {
  const hoy = hoyLima();
  const desdeOk = sp.desde && RE_FECHA.test(sp.desde) ? sp.desde : null;
  const hastaOk = sp.hasta && RE_FECHA.test(sp.hasta) ? sp.hasta : null;
  if (desdeOk && hastaOk && desdeOk <= hastaOk) {
    const preset = TODOS_LOS_PRESETS.find((p) => {
      const r = periodoPreset(p, hoy);
      return r.desde === desdeOk && r.hasta === hastaOk;
    });
    return { desde: desdeOk, hasta: hastaOk, preset: preset ?? null };
  }
  return { ...periodoPreset(porDefecto, hoy), preset: porDefecto };
}

/**
 * Semanas que tiene un mes, para bajar la meta mensual a meta semanal.
 *
 * 52 semanas ÷ 12 meses. No es 4: con 4 la meta semanal queda 8% alta y el
 * velocímetro nunca llega, que es exactamente lo que hace que un tablero deje
 * de mirarse. Las metas las fija RRHH en mensual (`perfiles.meta_mensual`) y
 * ahí se quedan; el CRM solo la reparte para poder mostrarla en la semana.
 */
export const SEMANAS_POR_MES = 52 / 12;

/** ¿El período elegido es una semana? Cambia cómo se lee la meta. */
export function esSemanal(preset: PresetPeriodo | null | undefined): boolean {
  return preset === "semana" || preset === "semana_anterior";
}

export const ETIQUETA_PRESET: Record<PresetPeriodo, string> = {
  semana: "Esta semana",
  semana_anterior: "Semana anterior",
  mes: "Este mes",
  mes_anterior: "Mes anterior",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  anio: "Este año",
  "12m": "Últimos 12 meses",
  todo: "Todo el historial",
};
