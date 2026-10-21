/**
 * UN COLOR POR CASO (gerencia, 20-10-2026: «para cada caso un color específico
 * para reconocer… el caso 50 en verde, el 100 en morado»).
 *
 * El color sale del número del código (CASO-00129 → 129), no del orden en la
 * pantalla: así el mismo caso tiene el mismo color en la ficha, en el
 * historial, en «Anotar gestión» y en el caso mismo, sin guardar nada.
 * Seis tonos que se distinguen entre sí en claro y oscuro; el gris queda para
 * lo que no es de ningún caso.
 */
export interface ColorCaso {
  /** Punto o borde fuerte. */
  punto: string;
  /** Fondo suave de la etiqueta. */
  fondo: string;
  /** Texto de la etiqueta. */
  texto: string;
  /** Borde izquierdo de una fila del historial. */
  borde: string;
}

const PALETA: ColorCaso[] = [
  { punto: "bg-sky-500", fondo: "bg-sky-500/10", texto: "text-sky-800 dark:text-sky-300", borde: "border-l-sky-500" },
  { punto: "bg-emerald-500", fondo: "bg-emerald-500/10", texto: "text-emerald-800 dark:text-emerald-300", borde: "border-l-emerald-500" },
  { punto: "bg-violet-500", fondo: "bg-violet-500/10", texto: "text-violet-800 dark:text-violet-300", borde: "border-l-violet-500" },
  { punto: "bg-amber-500", fondo: "bg-amber-500/10", texto: "text-amber-900 dark:text-amber-300", borde: "border-l-amber-500" },
  { punto: "bg-rose-500", fondo: "bg-rose-500/10", texto: "text-rose-800 dark:text-rose-300", borde: "border-l-rose-500" },
  { punto: "bg-teal-500", fondo: "bg-teal-500/10", texto: "text-teal-800 dark:text-teal-300", borde: "border-l-teal-500" },
];

export const SIN_CASO: ColorCaso = {
  punto: "bg-muted-foreground/40",
  fondo: "bg-muted",
  texto: "text-muted-foreground",
  borde: "border-l-border",
};

export function numeroDeCaso(codigo: string | null | undefined): number | null {
  const m = /(\d+)\s*$/.exec(codigo ?? "");
  return m ? Number(m[1]) : null;
}

export function colorDeCaso(codigo: string | null | undefined): ColorCaso {
  const n = numeroDeCaso(codigo);
  return n === null ? SIN_CASO : PALETA[n % PALETA.length];
}

const NOMBRE_TIPO: Record<string, string> = {
  problema_tecnico: "Problema técnico",
  solicitud_repuesto: "Repuesto",
  solicitud_mantenimiento: "Mantenimiento",
  puesta_en_marcha: "Puesta en marcha",
  soporte_tecnico: "Soporte técnico",
  revision_garantia: "Revisión por garantía",
  capacitacion: "Capacitación",
  otro: "Otro",
};

export function nombreTipoCaso(tipo: string, detalle?: string | null): string {
  if (tipo === "otro" && detalle) return detalle;
  return NOMBRE_TIPO[tipo] ?? tipo.replace(/_/g, " ");
}
