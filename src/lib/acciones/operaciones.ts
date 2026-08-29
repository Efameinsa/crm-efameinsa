"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Lo que hace la cuenta de operaciones (migraciones 0115 y 0116). Las reglas
// —quién puede, a quién y qué queda registrado— viven en la base; acá solo se
// pasa el pedido y se refrescan las pantallas que cambian.

export async function permitirCotizarMantenimiento(
  comercialId: string,
  activar: boolean,
): Promise<{ error: string | null; nombre?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("permitir_cotizar_mantenimiento", {
    p_comercial: comercialId,
    p_activar: activar,
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
  revalidatePath("/operaciones/permisos");
  return { error: null, nombre: (data as { nombre?: string })?.nombre };
}
