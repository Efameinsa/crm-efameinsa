"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";

/** «No son el mismo cliente»: el grupo deja de salir en Fichas repetidas (0556). */
export async function noSonElMismo(clave: string): Promise<{ error: string | null }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.from("fichas_no_repetidas").insert({ clave, motivo: "No son el mismo cliente" });
  if (error) return { error: error.code === "42501" ? "Esto lo deciden Central, operaciones o gerencia." : error.message };
  revalidatePath("/fichas-repetidas");
  return { error: null };
}
