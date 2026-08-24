/**
 * Búsqueda de equipos del cotizador.
 *
 * Vive acá y no dentro del componente porque es la pieza que decide si el
 * comercial encuentra o no lo que va a cotizar, y eso se prueba.
 *
 * QUÉ FALLABA. El 24-08 Brenda buscó «secadoras electricas primus semi
 * industrial modelo fde y nde» y no salió nada. Dos motivos encadenados:
 *
 *   1. Los equipos no estaban cargados. Eso ya se corrigió (SECFDEE, SECNDE).
 *   2. El buscador exigía que TODAS las palabras estuvieran en el equipo. En
 *      esa frase, «secadoras» va en plural y en el catálogo dice «secadora»;
 *      «modelo» y «y» no están en ningún equipo. Con una sola palabra que
 *      falle, el resultado es cero. Nadie escribe una palabra suelta cuando
 *      está apurado atendiendo a un cliente: escribe la frase.
 *
 * CÓMO QUEDA. Primero se intenta la búsqueda estricta —todas las palabras—,
 * que es la que da resultados precisos cuando el comercial teclea «rx135» o
 * «primus 20». Si esa no devuelve nada, se cae a una búsqueda por afinidad:
 * salen los equipos que coinciden en ALGO, ordenados por cuántas palabras
 * aciertan. Así la frase de Brenda devuelve la FDE y la NDE arriba de todo.
 *
 * Nunca devuelve menos que antes: la estricta se prueba primero.
 */

/** Palabras que no distinguen un equipo de otro; si se exigen, estorban. */
const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "y", "o", "con", "para", "por", "en",
  "modelo", "modelos", "tipo", "marca", "equipo", "equipos", "maquina", "maquinas",
]);

export function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Quita el plural castellano para que «secadoras» encuentre «secadora». */
function raiz(palabra: string): string {
  return palabra.replace(/(es|s)$/, "");
}

export interface EquipoBuscable {
  sku?: string | null;
  marca: string;
  modelo: string;
  nombre: string;
  capacidad?: string | null;
  /** «ELÉCTRICA», «GAS»… vive en la ficha, no en el nombre, y es como lo piden. */
  calentamiento?: string | null;
}

/** Todo el texto contra el que se busca un equipo, ya normalizado. */
export function textoBuscable(p: EquipoBuscable): string {
  return sinTildes(
    [p.sku ?? "", p.marca, p.modelo, p.nombre, p.capacidad ?? "", p.calentamiento ?? ""].join(" "),
  );
}

/** Las palabras de la consulta que vale la pena exigir. */
export function palabrasDeBusqueda(consulta: string): string[] {
  return sinTildes(consulta.trim())
    .split(/\s+/)
    .filter((p) => p.length >= 2 && !VACIAS.has(p));
}

function aciertos(buscable: string, palabras: string[]): number {
  let n = 0;
  for (const palabra of palabras) {
    if (buscable.includes(palabra) || buscable.includes(raiz(palabra))) n++;
  }
  return n;
}

export function buscarEquipos<T extends EquipoBuscable>(equipos: T[], consulta: string): T[] {
  const palabras = palabrasDeBusqueda(consulta);
  if (palabras.length === 0) return equipos;

  const puntuados = equipos.map((e) => ({ e, n: aciertos(textoBuscable(e), palabras) }));

  // Estricta: todas las palabras. Es la que quiere el que teclea «rx135».
  const estricta = puntuados.filter((x) => x.n === palabras.length);
  if (estricta.length > 0) return estricta.map((x) => x.e);

  // Por afinidad: lo que más acierta, primero. Se exige al menos la mitad de
  // las palabras — con una sola bastaba para que «plancha calandria vapor
  // industrial» arrastrara todas las lavadoras por el «industrial» de su
  // nombre. El orden original desempata, así el listado no salta de un tecleo
  // a otro.
  const minimo = Math.max(1, Math.ceil(palabras.length / 2));
  return puntuados
    .filter((x) => x.n >= minimo)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.e);
}
