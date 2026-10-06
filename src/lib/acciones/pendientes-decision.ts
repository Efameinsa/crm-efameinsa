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
};

export async function listarPendientesDecision(): Promise<PendienteDecision[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pendientes_decision")
    .select("id, titulo, detalle, sugerencia_id, created_at")
    .is("resuelto_at", null)
    .order("created_at");
  return (data ?? []) as PendienteDecision[];
}

/** Admin: lo da por decidido, con una nota opcional de qué se decidió. */
export async function decidirPendiente(datos: { id: string; resolucion: string }): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Su sesión venció: vuelva a entrar." };
  const { data, error } = await supabase
    .from("pendientes_decision")
    .update({ resuelto_at: new Date().toISOString(), resuelto_por: user.id, resolucion: datos.resolucion.trim() || null })
    .eq("id", datos.id)
    .select("id");
  if (error) return { error: "No se pudo guardar." };
  if (!data?.length) return { error: "Solo el administrador puede darlo por decidido." };
  revalidatePath("/observaciones");
  return { error: null };
}
