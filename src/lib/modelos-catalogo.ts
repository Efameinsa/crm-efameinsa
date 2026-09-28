/**
 * Los modelos del catálogo como sugerencias al fichar una máquina (reunión de
 * gerencia 28-09): «que te permita… y va arrojando el desplegado de los
 * equipos. Y va poniendo Titan, que se vaya recomendando… y también que te
 * permita escribir». Se sugiere el nombre completo —Carlos: «Titanline no…
 * lavadora, secadora, semi-industrial, toda la descripción completa»— y se
 * sigue pudiendo escribir cualquier cosa, porque también se fichan máquinas
 * de la competencia.
 *
 * Solo la parte pura (armar el texto y filtrar), para poder probarla sin base.
 */

export interface ModeloCatalogo {
  id: string;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  capacidad: string | null;
}

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Colapsa espacios y saltos de línea: en el catálogo el modelo trae «TITAN MAX\nCWT29MDCRS». */
const limpio = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * El texto que queda escrito en la máquina: el nombre del catálogo y, si el
 * nombre no los dice ya, la marca con el modelo y la capacidad.
 * «LAVADORA C. APILABLE · LG TITAN MAX CWT29MDCRS».
 */
export function textoDelModelo(p: ModeloCatalogo): string {
  const nombre = limpio(p.nombre);
  const n = plano(nombre);
  const marcaModelo = [limpio(p.marca), limpio(p.modelo)].filter((x) => x && !n.includes(plano(x))).join(" ");
  const capacidad = limpio(p.capacidad);
  return [nombre, marcaModelo, capacidad && !n.includes(plano(capacidad)) ? capacidad : ""].filter(Boolean).join(" · ");
}

/**
 * Los que casan con lo escrito: todas las palabras tienen que aparecer (en
 * cualquier orden, sin tildes ni mayúsculas) en el nombre, la marca, el modelo
 * o la capacidad. Con menos de dos letras no se sugiere nada: la lista entera
 * no ayuda a elegir.
 */
export function sugerirModelos(lista: ModeloCatalogo[], escrito: string, maximo = 8): ModeloCatalogo[] {
  const palabras = plano(escrito).split(" ").filter(Boolean);
  if (palabras.join("").length < 2) return [];
  const vistos = new Set<string>();
  const salida: ModeloCatalogo[] = [];
  for (const p of lista) {
    const heno = plano([p.nombre, p.marca, p.modelo, p.capacidad].filter(Boolean).join(" "));
    if (!palabras.every((w) => heno.includes(w))) continue;
    // El catálogo repite equipos (el mismo UT170 con dos nombres parecidos):
    // se sugiere cada texto una sola vez.
    const texto = textoDelModelo(p);
    if (vistos.has(texto)) continue;
    vistos.add(texto);
    salida.push(p);
    if (salida.length >= maximo) break;
  }
  return salida;
}

/** Si lo escrito es exactamente una sugerencia, el producto del catálogo; si no, null (texto libre). */
export function productoDelTexto(lista: ModeloCatalogo[], escrito: string): ModeloCatalogo | null {
  const t = limpio(escrito);
  return lista.find((p) => textoDelModelo(p) === t) ?? null;
}
