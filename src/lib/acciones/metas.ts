"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Cambiar una meta (0353). La puerta es `guardar_meta`: solo gerencia y admin,
 * y cada cambio deja su fila en `metas_historial` (quién, qué, de cuánto a
 * cuánto). `comercialId` = la meta de gestiones diarias de esa persona; sin
 * él, una meta del equipo en `parametros`.
 */
export async function guardarMeta(clave: string, valor: number, comercialId?: string | null): Promise<{ error: string | null }> {
  if (!Number.isFinite(valor)) return { error: "Escriba un número" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_meta", {
    p_clave: clave,
    p_valor: valor,
    p_comercial: comercialId ?? null,
  });
  if (error) {
    // Antes de aplicar la 0353 la función no existe: decirlo en palabras.
    if (/guardar_meta/.test(error.message) && /(does not exist|Could not find)/i.test(error.message)) {
      return { error: "Falta aplicar la migración 0353 en la base." };
    }
    return { error: error.message };
  }
  revalidatePath("/gerencia/metas");
  revalidatePath("/gerencia/supervision");
  return { error: null };
}
