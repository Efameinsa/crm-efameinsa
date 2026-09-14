"use server";

import { createClient } from "@/lib/supabase/server";

/** Leído, cumplido o «lo veo luego» (0232). */
export async function acusarComunicado(
  comunicadoId: string,
  accion: "leido" | "cumplido" | "luego",
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("acusar_comunicado", { p_comunicado: comunicadoId, p_accion: accion });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  return { error: null };
}
