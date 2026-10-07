/**
 * KITS CON CANTIDADES (gerencia, reunión 06-10 11:01).
 *
 * Un kit del catálogo (p. ej. «KIT DE INSTALACION PARA SECADORA LG», US$ 950)
 * lista sus piezas en la ficha, cada una con su cantidad al final:
 * «DUCTO FLEXIBLE 4" 3 METROS». Según el cliente cambia UNA cantidad (10 m de
 * ducto en vez de 3): quien cotiza la cambia en ESE renglón, sin tocar la
 * ficha, y la cotización pasa por gerencia (0405).
 *
 * Y Lesly (buzón, 06-10): en el PDF las cantidades salían desalineadas porque
 * la ficha las alinea con espacios y el PDF los junta. Con `partirCantidad` el
 * PDF las pone en su propia columna.
 */

const UNIDAD = "UND|UNDS|UNID|UNIDAD|UNIDADES|U|METRO|METROS|MTS|MT|M|ML|PZA|PZAS|PIEZA|PIEZAS|JGO|JGOS|JUEGO|JUEGOS|KG|KGS|GL|GLN|GALON|GALONES|ROLLO|ROLLOS|PAR|PARES|LT|LTS|LITRO|LITROS";
const CON_CANTIDAD = new RegExp(`^(.*?\\S)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNIDAD})\\.?$`, "i");

export interface PiezaConCantidad {
  /** La pieza, sin la cantidad: «DUCTO FLEXIBLE 4"». */
  texto: string;
  /** «3» (tal como está escrito). */
  numero: string;
  /** «METROS». */
  unidad: string;
}

/** «DUCTO FLEXIBLE 4"   3 METROS» → { texto, numero: "3", unidad: "METROS" }; sin cantidad al final → null. */
export function partirCantidad(linea: string): PiezaConCantidad | null {
  const plano = linea.replace(/^\s*[-•]\s*/, "").replace(/\s+/g, " ").trim();
  const m = plano.match(CON_CANTIDAD);
  if (!m) return null;
  return { texto: m[1].trim(), numero: m[2], unidad: m[3].toUpperCase() };
}

/** La línea vuelta a armar con otra cantidad. */
export function conCantidad(p: PiezaConCantidad, numero: string): string {
  return `${p.texto} ${numero.trim()} ${p.unidad}`;
}

type Bloque = { t: string; texto?: string };

/**
 * Las piezas de un kit: las viñetas de la ficha que terminan en cantidad. Hace
 * falta al menos dos para tratarlo como kit (una ficha de equipo con «1 UND»
 * suelto no lo es).
 */
export function piezasDeKit(ficha: Record<string, unknown> | null | undefined): string[] {
  const bloques = Array.isArray(ficha?.bloques) ? (ficha!.bloques as Bloque[]) : [];
  const piezas = bloques
    .filter((b) => b?.t === "vineta" && typeof b.texto === "string")
    .map((b) => (b.texto as string).replace(/\s+/g, " ").trim())
    .filter((t) => partirCantidad(t) !== null);
  return piezas.length >= 2 ? piezas : [];
}

/** ¿La pieza va en 0? Rubí (buzón, 06-10): «cuando coloque 0 que no aparezca en la cotización». */
export function piezaEnCero(linea: string): boolean {
  const p = partirCantidad(linea);
  return p !== null && Number(p.numero.replace(",", ".")) === 0;
}

/**
 * Los bloques de la ficha con las cantidades de ESTA cotización: cada viñeta
 * con cantidad se reemplaza, en orden, por la del renglón. La pieza que quedó
 * en 0 no sale. Lo demás no cambia.
 */
export function bloquesConKit<T extends Bloque>(bloques: T[] | undefined, detalleKit: string[] | null | undefined): T[] | undefined {
  if (!bloques || !detalleKit?.length) return bloques;
  let i = 0;
  return bloques.flatMap((b) => {
    if (b.t !== "vineta" || typeof b.texto !== "string" || !partirCantidad(b.texto) || i >= detalleKit.length) return [b];
    const linea = detalleKit[i++];
    return piezaEnCero(linea) ? [] : [{ ...b, texto: linea }];
  });
}

/** null si las cantidades son las de la ficha (no hay nada que guardar ni que aprobar). */
export function detalleKitSiCambio(piezasFicha: string[], piezas: string[]): string[] | null {
  const norm = (s: string) => {
    const p = partirCantidad(s);
    return p ? `${p.texto}|${Number(p.numero.replace(",", "."))}|${p.unidad}` : s;
  };
  if (piezas.length === piezasFicha.length && piezas.every((p, i) => norm(p) === norm(piezasFicha[i]))) return null;
  return piezas;
}

/** Para gerencia: «DUCTO FLEXIBLE 4": 3 → 10 METROS», solo las piezas que cambiaron. */
export function cambiosDelKit(piezasFicha: string[], detalleKit: string[] | null | undefined): string[] {
  if (!detalleKit?.length) return [];
  return detalleKit.flatMap((linea, i) => {
    const p = partirCantidad(linea);
    const b = piezasFicha[i] ? partirCantidad(piezasFicha[i]) : null;
    if (!p) return [];
    if (b && Number(b.numero.replace(",", ".")) === Number(p.numero.replace(",", "."))) return [];
    return [`${p.texto}: ${b ? `${b.numero} → ` : ""}${p.numero} ${p.unidad}`];
  });
}
