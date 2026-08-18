"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Tipo de cambio USD→PEN que usan los paneles de gerencia para comparar
// ventas (USD) con gasto publicitario (PEN). Solo backoffice puede
// escribirlo (RLS parametros_write); un comercial recibe error de RLS.
export async function actualizarTipoCambio(valor: number): Promise<{ error: string | null }> {
  if (!Number.isFinite(valor) || valor <= 0 || valor > 20) {
    return { error: "Ingrese un tipo de cambio válido (ej. 3.75)" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { data, error } = await supabase
    .from("parametros")
    .upsert({ clave: "tc_usd_pen", valor, updated_at: new Date().toISOString(), updated_by: user.id })
    .select("clave");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Solo gerencia puede cambiar el tipo de cambio" };

  revalidatePath("/gerencia", "layout");
  return { error: null };
}
