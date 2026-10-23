import { createClient } from "@/lib/supabase/server";
import type { Perfil } from "@/types/database";
import type { PropsVista } from "@/lib/propuesta/vistas";
import { PantallaExistente } from "@/lib/propuesta/paginas";

/**
 * COTIZACIONES DE POSTVENTA, CON SU NÚMERO EN LA PESTAÑA (Brenda, 23-10:
 * «¿cómo postventa puede ver sus cotizaciones pendientes de aprobación de
 * gerencia? No es como comercial, que tiene su pestaña al costado»).
 *
 * La pantalla es la de siempre («Mis cotizaciones», con «Lo que pasó por
 * gerencia»); lo que faltaba era que la pestaña dijera cuántas del área
 * esperan a gerencia, en rojo, sin tener que abrirla.
 */
type Cliente = Awaited<ReturnType<typeof createClient>>;

export async function idsDelArea(supabase: Cliente, perfil: Perfil): Promise<string[]> {
  const { data } = await supabase.from("perfiles").select("id").eq("es_postventa", true).eq("es_prueba", perfil.es_prueba === true);
  return [...new Set([perfil.id, ...((data ?? []) as { id: string }[]).map((x) => x.id)])];
}

export async function conteo(supabase: Cliente, perfil: Perfil): Promise<number> {
  const duenos = await idsDelArea(supabase, perfil);
  const { count } = await supabase
    .from("cotizaciones")
    .select("id, oportunidades!cotizaciones_oportunidad_id_fkey!inner(comercial_id)", { count: "exact", head: true })
    .in("oportunidades.comercial_id", duenos)
    .eq("estado_aprobacion", "pendiente_gerencia")
    .is("anulada_at", null);
  return count ?? 0;
}
export const alerta = true;

export default async function PostventaCotizaciones({ searchParams }: PropsVista) {
  return <PantallaExistente clave="comercial/cotizaciones" searchParams={Promise.resolve(searchParams)} />;
}
