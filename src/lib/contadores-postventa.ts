import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Los dos números del menú del área (plan 23, etapa 5): «el número es el
 * llamado a la acción» (§2.6.3). Solo se calculan para quien ve la sección
 * Postventa de la barra —`es_postventa` o `es_soporte`—, y con `head: true`
 * en cada consulta: son conteos, no listas, y no hay por qué bajar una sola
 * fila para saber cuántas hay.
 */

/** Las atenciones abiertas: el mismo número que ya muestra la pantalla. */
export async function contarAtencionesAbiertas(supabase: Supabase): Promise<number> {
  const { count } = await supabase.from("atenciones").select("id", { count: "exact", head: true }).is("cerrado_at", null);
  return count ?? 0;
}

/**
 * «Llegó y espera su acuse»: la misma suma de tres orígenes que arma «Mi
 * día», pero contada, no listada.
 */
export async function contarBandejaMiDia(supabase: Supabase, comercialId: string): Promise<number> {
  const [{ count: atenciones }, { count: casos }, { count: pedidos }] = await Promise.all([
    supabase.from("atenciones").select("id", { count: "exact", head: true }).eq("etapa", "registro").is("cerrado_at", null),
    supabase
      .from("oportunidades")
      .select("id", { count: "exact", head: true })
      .eq("comercial_id", comercialId)
      .eq("origen", "crm")
      .eq("etapa", "asignada")
      .not("tipo_postventa", "is", null),
    supabase
      .from("servicios_postventa")
      .select("id", { count: "exact", head: true })
      .not("pedido_ejecutado_at", "is", null)
      .not("liquidacion_at", "is", null)
      .is("aprobado_at", null)
      .eq("completado", false),
  ]);
  return (atenciones ?? 0) + (casos ?? 0) + (pedidos ?? 0);
}
