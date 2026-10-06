import type { SupabaseClient } from "@supabase/supabase-js";
import { totalesConIgv, type RenglonConIgv } from "@/lib/igv";

/**
 * EL TOTAL CON IGV QUE DICE EL PDF, PARA LAS TARJETAS Y LOS HISTORIALES.
 *
 * Katerine, 06-10 (Presu_1061-26, WONG LU VEGA): el PDF decía USD 7,900.00 y
 * la tarjeta del expediente USD 7,900.01. La Titan se pactó en 7,605 CON IGV
 * (0233) y se guarda su neto redondeado, 6,444.92; la tarjeta multiplicaba el
 * total neto guardado por 1,18 y el redondeo del neto dejaba un centavo de más.
 * El PDF suma renglón por renglón (`totalesConIgv`). Esto devuelve ese mismo
 * total, solo para las cotizaciones que tienen algún renglón pactado con IGV:
 * las demás siguen con `total × 1,18`, que para ellas es idéntico.
 *
 * Si la RLS no deja leer los renglones, el mapa sale vacío y se muestra lo de
 * antes: nunca menos información que hoy.
 */
export async function totalesConIgvExactos(
  supabase: SupabaseClient,
  cotizacionIds: string[],
): Promise<Map<string, number>> {
  const salida = new Map<string, number>();
  const ids = [...new Set(cotizacionIds)];
  // `in()` viaja en la URL: en lotes para no armar una petición gigante.
  for (let i = 0; i < ids.length; i += 120) {
    const { data } = await supabase
      .from("cotizacion_items")
      .select("cotizacion_id, cantidad, precio_unitario, precio_con_igv")
      .in("cotizacion_id", ids.slice(i, i + 120));
    const porCotizacion = new Map<string, RenglonConIgv[]>();
    for (const r of (data ?? []) as (RenglonConIgv & { cotizacion_id: string })[]) {
      const lista = porCotizacion.get(r.cotizacion_id) ?? [];
      lista.push({ cantidad: Number(r.cantidad), precio_unitario: Number(r.precio_unitario), precio_con_igv: r.precio_con_igv });
      porCotizacion.set(r.cotizacion_id, lista);
    }
    for (const [id, renglones] of porCotizacion) {
      if (renglones.some((r) => r.precio_con_igv != null)) salida.set(id, totalesConIgv(renglones).total);
    }
  }
  return salida;
}
