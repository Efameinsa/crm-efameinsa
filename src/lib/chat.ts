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
  /** Quiénes ya lo leyeron (sin quien lo escribió), con nombre completo. */
  vistos: string[];
  /** Quiénes del canal todavía no lo leyeron (sin quien lo escribió). */
  sinVer: string[];
  /** A quiénes señaló con «@» (0599). */
  menciones: { id: string; nombre: string }[];
  /** Me señalaron a mí en este mensaje. */
  meMenciona: boolean;
};

/** Un chat en la lista de «mis chats» (menú y pantalla /chats, 0599). */
export type ChatResumen = {
  tipo: TipoChat;
  id: string;
  codigo: string | null;
  cliente: string;
  titulo: string;
  cerradoAt: string | null;
  ultimo: { texto: string; autor: string; mio: boolean; clase: "mensaje" | "apuro" | "sistema"; at: string } | null;
  noLeidos: number;
  participantes: number;
  /** Del último mensaje: quiénes ya lo vieron y quiénes faltan (nombre completo). */
  vistos: string[];
  sinVer: string[];
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

/**
 * EL «@» (Santos 23-10: «señalar a un participante con un arroba»). En el
 * texto va «@Nombre Apellido» tal cual; el servidor guarda los ids. Para
 * pintarlo, el texto se parte en trozos: los que son una mención y los que no.
 */
export function partirMenciones(texto: string, menciones: { id: string; nombre: string }[]): { texto: string; mencion: boolean }[] {
  if (!menciones.length || !texto.includes("@")) return [{ texto, mencion: false }];
  // Los nombres más largos primero: «@Brenda Taboada» antes que «@Brenda».
  const nombres = [...new Set(menciones.map((m) => m.nombre.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const patron = new RegExp(`@(${nombres.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const trozos: { texto: string; mencion: boolean }[] = [];
  let desde = 0;
  for (const m of texto.matchAll(patron)) {
    const i = m.index ?? 0;
    if (i > desde) trozos.push({ texto: texto.slice(desde, i), mencion: false });
    trozos.push({ texto: m[0], mencion: true });
    desde = i + m[0].length;
  }
  if (desde < texto.length) trozos.push({ texto: texto.slice(desde), mencion: false });
  return trozos;
}

/** Los ids de las personas que el texto señala con «@» (de las que se eligieron al escribir). */
export function mencionesEnElTexto(texto: string, elegidas: { id: string; nombre: string }[]): string[] {
  return [...new Set(elegidas.filter((p) => texto.includes(`@${p.nombre}`)).map((p) => p.id))];
}

/** «Hace 2 días», «hoy», «ayer»: cuánto hace que alguien entró al CRM (días de calendario en Lima). */
export function diasSinEntrar(ultimoAcceso: string | null, ahora = new Date()): number | null {
  if (!ultimoAcceso) return null;
  const dia = (d: Date) => new Date(d.toLocaleDateString("en-CA", { timeZone: "America/Lima" })).getTime();
  return Math.max(0, Math.round((dia(ahora) - dia(new Date(ultimoAcceso))) / 86_400_000));
}
