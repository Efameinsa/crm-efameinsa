import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * QUÉ CIFRAS VE POSTVENTA (Santos, 28-09): «todas las cotizaciones y gestiones
 * que realice postventa deben salir con el precio unitario y total; la regla de
 * que no pueden ver las cantidades es solo para los productos que fueron
 * vendidos o que están en el historial».
 *
 * Se tapa lo que vendió un comercial (la cotización de un expediente
 * comercial, su cierre, su pedido y lo del archivo). Lo que nace de un
 * expediente DE POSTVENTA (`tipo_postventa` no nulo) —su repuesto, su
 * mantenimiento, su servicio— se ve completo: es el trabajo del área.
 */

/** ¿Estos expedientes son de postventa? Devuelve los que sí. */
export async function expedientesDePostventa(supabase: SupabaseClient, ids: (string | null | undefined)[]): Promise<Set<string>> {
  const unicos = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!unicos.length) return new Set();
  const { data } = await supabase.from("oportunidades").select("id").in("id", unicos.slice(0, 150)).not("tipo_postventa", "is", null);
  return new Set((data ?? []).map((o) => o.id as string));
}

/**
 * Los cierres que salieron de un expediente de postventa. El cierre apunta a
 * su expediente directo o a través de la cotización de la que salió.
 */
export async function cierresDePostventa(supabase: SupabaseClient, idsCierre: (string | null | undefined)[]): Promise<Set<string>> {
  const ids = [...new Set(idsCierre.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return new Set();
  const { data: cierres } = await supabase.from("informes_cierre").select("id, oportunidad_id, cotizacion_id").in("id", ids.slice(0, 150));
  const cotIds = (cierres ?? []).map((c) => c.cotizacion_id as string | null).filter((x): x is string => Boolean(x));
  const { data: cots } = cotIds.length
    ? await supabase.from("cotizaciones").select("id, oportunidad_id").in("id", cotIds)
    : { data: [] as { id: string; oportunidad_id: string }[] };
  const opDeCot = new Map((cots ?? []).map((c) => [c.id as string, c.oportunidad_id as string]));
  const opDe = new Map(
    (cierres ?? []).map((c) => [c.id as string, (c.oportunidad_id as string | null) ?? (c.cotizacion_id ? opDeCot.get(c.cotizacion_id as string) : undefined) ?? null]),
  );
  const dePostventa = await expedientesDePostventa(supabase, [...opDe.values()]);
  return new Set([...opDe.entries()].filter(([, op]) => op && dePostventa.has(op)).map(([id]) => id));
}
