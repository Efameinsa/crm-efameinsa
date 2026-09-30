/**
 * «TERMINÉ, PUEDEN RECOGERLO» (0350). Carlos, reunión 30-09 12:35: «que me
 * lleve una notificación para ir a recoger el file… el botoncito donde dice
 * files, Terminé». Lo que se calcula en pantalla: cuánto hace que avisó, desde
 * cuándo puede volver a recordarle a Central y la línea con la hora de cada
 * paso del préstamo («para que no haya manera de errores»).
 */

/** Igual que la base: un aviso a Central cada 30 minutos como máximo. */
export const RECORDAR_CADA_MIN = 30;

const ZONA = "America/Lima";
const dia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: ZONA });
const hora = (d: Date) => d.toLocaleTimeString("es-PE", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false });
const diaMes = (d: Date) => d.toLocaleDateString("es-PE", { timeZone: ZONA, day: "numeric", month: "numeric" });

/** «hace 20 min», «hace 2 h 5 min»; de otro día, «desde el 29/9 16:40». */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  const min = Math.max(0, Math.floor((ahora.getTime() - d.getTime()) / 60000));
  if (dia(d) !== dia(ahora)) return `desde el ${diaMes(d)} ${hora(d)}`;
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return `hace ${h} h${resto ? ` ${resto} min` : ""}`;
}

/** Desde cuándo puede recordarle a Central; null si ya puede (o nunca avisó). */
export function recordarDesde(ultimoAviso: string | null, ahora: Date = new Date()): Date | null {
  if (!ultimoAviso) return null;
  const desde = new Date(new Date(ultimoAviso).getTime() + RECORDAR_CADA_MIN * 60000);
  return desde > ahora ? desde : null;
}

/** La hora en Lima («13:56»), para decir desde cuándo se puede recordar. */
export const horaLima = (d: Date | string) => hora(new Date(d));

export type PasosDelFile = {
  solicitado_at: string;
  entregado_at: string | null;
  recibido_at: string | null;
  termine_at: string | null;
  devuelto_at: string | null;
  anulado_at: string | null;
};

/**
 * «Pedido 30/9 09:01 · Entregado 09:10 · Recibido 09:12 · Terminé 11:40 ·
 * Devuelto 11:55». El día se repite solo cuando cambia, así se lee de un
 * vistazo si el file durmió fuera del archivador.
 */
export function lineaDePasos(f: PasosDelFile): string {
  const pasos: [string, string | null][] = [
    ["Pedido", f.solicitado_at],
    ["Entregado", f.entregado_at],
    ["Recibido", f.recibido_at],
    ["Terminé", f.termine_at],
    ["Devuelto", f.devuelto_at],
    ["Anulado", f.anulado_at],
  ];
  let diaAnterior = "";
  return pasos
    .filter((p): p is [string, string] => Boolean(p[1]))
    .map(([nombre, iso]) => {
      const d = new Date(iso);
      const mismoDia = dia(d) === diaAnterior;
      diaAnterior = dia(d);
      return `${nombre} ${mismoDia ? "" : `${diaMes(d)} `}${hora(d)}`;
    })
    .join(" · ");
}
