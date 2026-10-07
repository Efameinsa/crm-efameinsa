"use server";

// ESPERAN TU DECISIÓN (0411, Santos 06-10). Lo que el atendedor del buzón no
// pudo resolver solo porque necesita que admin/gerencia decida.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PendienteDecision = {
  id: string;
  titulo: string;
  detalle: string | null;
  sugerencia_id: string | null;
  created_at: string;
  /** Decidido con orden para el agente: espera (o ya terminó) su ejecución. */
  ejecutar: boolean;
  resolucion: string | null;
  resuelto_at: string | null;
  ejecutado_at: string | null;
  resultado: string | null;
};

export async function listarPendientesDecision(): Promise<PendienteDecision[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pendientes_decision")
    .select("id, titulo, detalle, sugerencia_id, created_at, ejecutar, resolucion, resuelto_at, ejecutado_at, resultado")
    .is("resuelto_at", null)
    .order("created_at");
  return (data ?? []) as PendienteDecision[];
}

/** Órdenes dadas al agente: las que esperan ejecución y las terminadas hace menos de 3 días. */
export async function listarOrdenesAlAgente(): Promise<PendienteDecision[]> {
  const supabase = await createClient();
  const desde = new Date(Date.now() - 3 * 86400e3).toISOString();
  const { data } = await supabase
    .from("pendientes_decision")
    .select("id, titulo, detalle, sugerencia_id, created_at, ejecutar, resolucion, resuelto_at, ejecutado_at, resultado")
    .eq("ejecutar", true)
    .or(`ejecutado_at.is.null,ejecutado_at.gte.${desde}`)
    .order("resuelto_at", { ascending: false });
  return (data ?? []) as PendienteDecision[];
}

/**
 * Admin: lo da por decidido, con una nota de qué se decidió. Con `ejecutar`, la
 * nota es la orden: el vigilante del buzón abre al agente, lo hace y deja el resultado.
 */
export async function decidirPendiente(datos: { id: string; resolucion: string; ejecutar?: boolean }): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Su sesión venció: vuelva a entrar." };
  const nota = datos.resolucion.trim();
  if (datos.ejecutar && !nota) return { error: "Escriba qué debe hacer el agente." };
  const { data, error } = await supabase
    .from("pendientes_decision")
    .update({ resuelto_at: new Date().toISOString(), resuelto_por: user.id, resolucion: nota || null, ejecutar: !!datos.ejecutar })
    .eq("id", datos.id)
    .select("id");
  if (error) return { error: "No se pudo guardar." };
  if (!data?.length) return { error: "Solo el administrador puede darlo por decidido." };
  revalidatePath("/observaciones");
  return { error: null };
}
