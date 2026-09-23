import { hoyLima } from "@/lib/periodo";

/**
 * El filtro «Seguimiento» de Mi cartera (23-09, 0281): clientes con o sin
 * gestión de contacto (llamada, WhatsApp, correo, visita, reunión) desde el
 * inicio del período. La cuenta la hace `listar_clientes()` en la base, porque
 * la lista va paginada y una cartera tiene miles de clientes.
 *
 * Sin importar nada de servidor: el desplegable (cliente) usa las etiquetas.
 */
export const SEGUIMIENTOS = ["sin-hoy", "sin-semana", "sin-30", "con-hoy", "con-semana"] as const;
export type SeguimientoCartera = (typeof SEGUIMIENTOS)[number];

export const ETIQUETA_SEGUIMIENTO: Record<SeguimientoCartera, string> = {
  "sin-hoy": "Sin gestión hoy",
  "sin-semana": "Sin gestión esta semana",
  "sin-30": "Sin gestión en 30 días",
  "con-hoy": "Gestionados hoy",
  "con-semana": "Gestionados esta semana",
};

export function leerSeguimiento(valor: string | undefined): SeguimientoCartera | null {
  return SEGUIMIENTOS.includes(valor as SeguimientoCartera) ? (valor as SeguimientoCartera) : null;
}

/** Lo que recibe `listar_clientes()`: «con» o «sin» y la fecha desde la que se cuenta (Lima). */
export function parametrosSeguimiento(s: SeguimientoCartera | null): { gestion: "con" | "sin" | null; gestionDesde: string | null } {
  if (!s) return { gestion: null, gestionDesde: null };
  const hoy = hoyLima();
  const [gestion, periodo] = s.split("-") as ["con" | "sin", "hoy" | "semana" | "30"];
  if (periodo === "hoy") return { gestion, gestionDesde: hoy };
  const d = new Date(`${hoy}T12:00:00Z`);
  // La semana empieza el lunes, como la meta y el cierre semanal.
  d.setUTCDate(d.getUTCDate() - (periodo === "semana" ? (d.getUTCDay() + 6) % 7 : 29));
  return { gestion, gestionDesde: d.toISOString().slice(0, 10) };
}
