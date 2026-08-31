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
  const [{ count: atenciones }, { data: casosAsignados }, { count: pedidos }] = await Promise.all([
    supabase.from("atenciones").select("id", { count: "exact", head: true }).eq("etapa", "registro").is("cerrado_at", null),
    // Los casos van por id y no por conteo: un caso con gestión registrada ya
    // está tomado aunque siga en «asignada» (el área trabaja sin mover el
    // desplegable — mismo criterio que la bandeja de Mi día, o el número del
    // menú promete filas que la pantalla no muestra).
    supabase
      .from("oportunidades")
      .select("id")
      .eq("comercial_id", comercialId)
      .eq("origen", "crm")
      .eq("etapa", "asignada")
      .not("tipo_postventa", "is", null)
      .limit(30),
    supabase
      .from("servicios_postventa")
      .select("id", { count: "exact", head: true })
      .not("pedido_ejecutado_at", "is", null)
      .not("liquidacion_at", "is", null)
      .is("aprobado_at", null)
      .eq("completado", false),
  ]);

  const ids = (casosAsignados ?? []).map((c) => c.id as string);
  let casosSinTocar = 0;
  if (ids.length) {
    const { data: gestionadas } = await supabase.from("actividades").select("oportunidad_id").in("oportunidad_id", ids);
    const conGestion = new Set((gestionadas ?? []).map((g) => g.oportunidad_id as string));
    casosSinTocar = ids.filter((id) => !conGestion.has(id)).length;
  }

  return (atenciones ?? 0) + casosSinTocar + (pedidos ?? 0);
}
