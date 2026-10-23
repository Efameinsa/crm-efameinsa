/**
 * El chat de cada caso y de cada pedido (Santos, 23-10; 0592): tipos y nombres
 * que comparten la pantalla y el servidor.
 */
export type TipoChat = "caso" | "pedido";
export type AreaChat = "central" | "almacen" | "finanzas" | "contabilidad" | "postventa" | "comercial";

export const AREAS_CHAT: Record<AreaChat, string> = {
  postventa: "Postventa",
  almacen: "Almacén",
  finanzas: "Finanzas",
  contabilidad: "Contabilidad / Facturación",
  central: "Central",
  comercial: "Comercial de la venta",
};

export type MensajeChat = {
  id: string;
  texto: string;
  para: AreaChat | null;
  clase: "mensaje" | "apuro" | "sistema";
  at: string;
  mio: boolean;
  autor: string;
  area: string;
  /** Quiénes ya lo leyeron (sin quien lo escribió). */
  vistos: string[];
};

/** El área con que se presenta quien escribe (lo que se lee junto a su nombre). */
export function areaDePerfil(p: { rol?: string | null; es_postventa?: boolean | null; es_almacen?: boolean | null; es_operaciones?: boolean | null; es_soporte?: boolean | null }): string {
  if (p.es_postventa) return "Postventa";
  if (p.es_almacen) return "Almacén";
  if (p.es_operaciones || p.rol === "operaciones" || p.es_soporte) return "Operaciones";
  if (p.rol === "finanzas") return "Finanzas";
  if (p.rol === "facturacion") return "Contabilidad";
  if (p.rol === "central") return "Central";
  if (p.rol === "gerencia" || p.rol === "admin") return "Gerencia";
  if (p.rol === "comercial") return "Comercial";
  return "";
}

/** «#chat=caso:<id>» abre el chat al llegar a una pantalla. */
export function chatDelEnlace(hash: string): { tipo: TipoChat; id: string } | null {
  const m = /#chat=(caso|pedido):([\w-]+)/.exec(hash);
  return m ? { tipo: m[1] as TipoChat, id: m[2] } : null;
}
