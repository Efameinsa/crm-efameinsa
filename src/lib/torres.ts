import type { createClient } from "@/lib/supabase/server";

type Cliente = Awaited<ReturnType<typeof createClient>>;

/**
 * ¿La unidad es una torre apilable (lavadora + secadora, dos placas)? (0359)
 * «TORRE APILABLE LAVADORA CENTRIFUGA - SECADORA…», «LAVADORA – SECADORA …
 * APILABLE». Una lavadora «apilable» sola NO es torre: es una máquina.
 */
export function esTorre(descripcion: string): boolean {
  const d = descripcion.toUpperCase();
  return /\bTORRE\b/.test(d) || (d.includes("LAVADORA") && d.includes("SECADORA"));
}

/**
 * Las series que el cierre ya trae escritas en la descripción (GENNER FASHION,
 * 06-10: «… Serie: 501KWYP7X378 Serie: 304KWQW0V220»). Sirven para proponer la
 * de la secadora al abrir «+ Serie de la secadora»; el almacén la confirma con
 * la placa. Solo cuenta lo que viene tras «Serie:» / «S/N:».
 */
export function seriesDeLaDescripcion(descripcion: string): string[] {
  const salida: string[] = [];
  for (const m of descripcion.toUpperCase().matchAll(/\b(?:SERIE|S\/N)\s*[:#]\s*([A-Z0-9][A-Z0-9-]{4,})/g)) {
    if (!salida.includes(m[1])) salida.push(m[1]);
  }
  return salida;
}

/**
 * LAS TORRES A LAS QUE LES FALTA LA SEGUNDA SERIE (Lesly, 30-09). Una torre con
 * la serie de la lavadora ya no tenía «unidades sin serie» y salía de
 * «Generación de código» antes de poner la secadora: Lesly no la encontraba
 * en el almacén. Cuenta como pendiente mientras el pedido no haya salido y la
 * unidad no tenga su parte (ni las dos series escritas juntas, «A / B», como
 * se hacía antes).
 *
 * Devuelve cuántas torres incompletas tiene cada pedido.
 */
export async function torresSinSegundaSerie(supabase: Cliente, servicioIds?: string[]): Promise<Map<string, number>> {
  const salida = new Map<string, number>();
  if (servicioIds && servicioIds.length === 0) return salida;
  let consulta = supabase
    .from("pedido_equipos")
    .select("id, servicio_id, descripcion, serie, sin_serie, servicios_postventa!inner(id)")
    .is("parte_de", null)
    .not("serie", "is", null)
    .or("descripcion.ilike.%torre%,and(descripcion.ilike.%lavadora%,descripcion.ilike.%secadora%)")
    .not("servicios_postventa.series_pedidas_at", "is", null)
    .is("servicios_postventa.cerrado_at", null)
    .is("servicios_postventa.despachado_at", null)
    .limit(500);
  // Pocos ids (los de una lista ya filtrada): el .in() no revienta la URL.
  if (servicioIds) consulta = consulta.in("servicio_id", servicioIds.slice(0, 150));
  const { data } = await consulta;
  const torres = ((data ?? []) as { id: string; servicio_id: string; descripcion: string; serie: string; sin_serie: boolean | null }[]).filter(
    (t) => !t.sin_serie && !t.serie.includes("/") && esTorre(t.descripcion),
  );
  if (torres.length === 0) return salida;
  const { data: partes } = await supabase.from("pedido_equipos").select("parte_de").in("parte_de", torres.map((t) => t.id).slice(0, 150));
  const conParte = new Set(((partes ?? []) as { parte_de: string }[]).map((p) => p.parte_de));
  for (const t of torres) {
    if (conParte.has(t.id)) continue;
    salida.set(t.servicio_id, (salida.get(t.servicio_id) ?? 0) + 1);
  }
  return salida;
}
