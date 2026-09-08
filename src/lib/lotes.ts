/**
 * PEDIR POR LOTES, PORQUE LA URL TIENE TECHO.
 *
 * PostgREST arma los filtros en la URL: `.in("id", [...500 uuid])` se convierte
 * en un GET de 18.580 caracteres que nunca llega. Y el fallo es traicionero —
 * no devuelve un error de «URL muy larga»: el pedido muere solo después de
 * varios segundos y supabase-js entrega `data: null`, que el código de arriba
 * suele leer como «no hay resultados».
 *
 * Ya pasó tres veces en este proyecto:
 *   · 18-08: el velocímetro del comercial marcaba 0 con ventas hechas (lo
 *     reportó Darwin); se resolvió llevando la cuenta a `resumen_gerencia`.
 *   · La bandeja de Central, que desde entonces pide por lotes.
 *   · 08-09: «Preventivos por vender» tardaba once segundos Y mostraba la
 *     columna «última gestión» vacía; nueve de esos segundos eran el pedido
 *     muriéndose (0194).
 *
 * Regla: si la lista de ids puede pasar de cien, o se pide por lotes con esto,
 * o se hace una función en la base que reciba el arreglo por POST. Lo segundo
 * es mejor cuando además se puede reducir el resultado (una fila por
 * oportunidad en vez de dos mil).
 */

/**
 * Cien ids por pedido. Con UUID son unos 3.700 caracteres de URL: lejos del
 * techo, y sin partir la lista en tantos viajes que se note.
 */
export const TAMANO_LOTE = 100;

/** Parte una lista larga en lotes que sí caben en una URL. */
export function enLotes<T>(xs: T[], tamano: number = TAMANO_LOTE): T[][] {
  if (tamano < 1) throw new Error("El lote tiene que ser de al menos un elemento");
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += tamano) out.push(xs.slice(i, i + tamano));
  return out;
}

/**
 * Corre la misma consulta por lotes y junta las filas. `pedir` recibe un lote
 * y devuelve lo que devuelve supabase-js.
 *
 * Si un lote falla, se propaga el error en vez de devolver una lista a medias:
 * media respuesta que parece entera es justamente el problema que esto viene a
 * resolver.
 */
export async function traerPorLotes<T>(
  ids: string[],
  pedir: (lote: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tamano: number = TAMANO_LOTE,
): Promise<{ data: T[]; error: string | null }> {
  if (ids.length === 0) return { data: [], error: null };
  const filas: T[] = [];
  for (const lote of enLotes(ids, tamano)) {
    const { data, error } = await pedir(lote);
    if (error) return { data: [], error: error.message };
    filas.push(...(data ?? []));
  }
  return { data: filas, error: null };
}
