/**
 * EL TIPO DEL EXPEDIENTE, CON SU NOMBRE Y SU COLOR (reunión de gerencia 28-09).
 *
 * Carlos: «¿qué tipo de gestión es esto?… el tipo de gestión que se vea más
 * llamativo… tiene que ver con un color específico». Y la lista que dictó para
 * el desplegable de Central y para reclasificar: «despacho, puesta en marcha,
 * mantenimiento, repuestos… y problema técnico. Mantenimiento preventivo,
 * mantenimiento correctivo». Un solo sitio para los nombres y los colores:
 * antes había seis copias del mapa, cada una con otro nombre para lo mismo.
 */
export const TIPOS_EXPEDIENTE = [
  "garantia",
  "soporte_tecnico",
  "puesta_en_marcha",
  "despacho",
  "mantenimiento",
  "mantenimiento_correctivo",
  "repuesto",
  "seguimiento",
] as const;

export type TipoExpediente = (typeof TIPOS_EXPEDIENTE)[number];

export const ETIQUETA_TIPO_EXPEDIENTE: Record<string, string> = {
  garantia: "Problema técnico",
  soporte_tecnico: "Soporte técnico",
  puesta_en_marcha: "Puesta en marcha",
  despacho: "Despacho",
  mantenimiento: "Mantenimiento preventivo",
  mantenimiento_correctivo: "Mantenimiento correctivo",
  repuesto: "Repuestos",
  seguimiento: "Seguimiento",
};

/** Qué es cada uno, en una línea, para el desplegable de Central y el de reclasificar. */
export const AYUDA_TIPO_EXPEDIENTE: Record<string, string> = {
  garantia: "el equipo falla o no está operativo",
  soporte_tecnico: "orientar o asistir al cliente (uso, configuración, limpieza, dudas) sin que haya una falla",
  puesta_en_marcha: "el equipo ya llegó y hay que ponerlo en marcha",
  despacho: "el cliente pide que le despachen lo que compró",
  mantenimiento: "mantenimiento programado para que no falle",
  mantenimiento_correctivo: "reparar algo que ya falló, fuera de garantía",
  repuesto: "pide una pieza o un repuesto",
  seguimiento: "seguimiento general del cliente, sin un caso puntual",
};

/** Clases completas (Tailwind no ve las interpoladas). Fondo + letra + borde. */
export const COLOR_TIPO_EXPEDIENTE: Record<string, string> = {
  garantia: "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  soporte_tecnico: "border-teal-600/40 bg-teal-500/15 text-teal-800 dark:text-teal-300",
  puesta_en_marcha: "border-emerald-600/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  despacho: "border-[#7E1210]/40 bg-[#7E1210]/10 text-[#7E1210] dark:text-rose-300",
  mantenimiento: "border-sky-600/40 bg-sky-500/15 text-sky-800 dark:text-sky-300",
  mantenimiento_correctivo: "border-orange-600/40 bg-orange-500/15 text-orange-800 dark:text-orange-300",
  repuesto: "border-violet-600/40 bg-violet-500/15 text-violet-800 dark:text-violet-300",
  seguimiento: "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  comercial: "border-border bg-secondary text-foreground",
};

/** El borde izquierdo de la fila del historial, del mismo color que la etiqueta. */
export const BORDE_TIPO_EXPEDIENTE: Record<string, string> = {
  garantia: "border-l-amber-500",
  soporte_tecnico: "border-l-teal-600",
  puesta_en_marcha: "border-l-emerald-600",
  despacho: "border-l-[#7E1210]",
  mantenimiento: "border-l-sky-600",
  mantenimiento_correctivo: "border-l-orange-600",
  repuesto: "border-l-violet-600",
  seguimiento: "border-l-slate-500",
  comercial: "border-l-border",
};

export function etiquetaTipoExpediente(tipo: string | null | undefined): string {
  if (!tipo) return "Comercial";
  return ETIQUETA_TIPO_EXPEDIENTE[tipo] ?? tipo;
}

export function colorTipoExpediente(tipo: string | null | undefined): string {
  return COLOR_TIPO_EXPEDIENTE[tipo ?? "comercial"] ?? COLOR_TIPO_EXPEDIENTE.comercial;
}

export function bordeTipoExpediente(tipo: string | null | undefined): string {
  return BORDE_TIPO_EXPEDIENTE[tipo ?? "comercial"] ?? BORDE_TIPO_EXPEDIENTE.comercial;
}
