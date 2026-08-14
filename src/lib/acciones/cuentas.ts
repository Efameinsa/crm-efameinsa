"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// El resumen narrativo vive en cuentas.notas (existe desde B1, sin UI hasta
// ahora). La RLS ya resuelve quién puede editar: cuentas_comercial (FOR ALL,
// comercial_id = auth.uid()) permite solo al dueño ACTUAL de la cartera;
// cuentas_backoffice a gerencia/admin. Un comercial que perdió la cartera
// puede LEER el resumen (la ficha se lo muestra) pero no editarlo.
export async function actualizarResumenCuenta(
  cuentaId: string,
  notas: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  // Supabase no lanza excepción cuando RLS filtra un update — solo afecta 0
  // filas (bug pagado en B6). Por eso se revisa el .select() de vuelta.
  const { data, error } = await supabase
    .from("cuentas")
    .update({ notas: notas.trim() || null })
    .eq("id", cuentaId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Solo el dueño actual de la cartera puede editar el resumen" };
  }

  revalidatePath(`/comercial/cartera/${cuentaId}`);
  revalidatePath(`/gerencia/clientes/${cuentaId}`);
  return { error: null };
}
