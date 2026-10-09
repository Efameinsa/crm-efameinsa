"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Saldo de Google Ads (0421): gerencia y admin anotan recargas, el saldo real
// que muestra Google y el tope diario. La RLS ya frena a cualquier otro rol;
// acá solo se valida el dato y se traduce el error.

async function usuario() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function fechaValida(fecha: string | null | undefined): string | null {
  if (!fecha) return new Date().toISOString();
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  // Una recarga no puede ser de más de una hora en el futuro (error de tipeo).
  if (d.getTime() > Date.now() + 3_600_000) return null;
  return d.toISOString();
}

export async function anotarMovimientoSaldo(datos: {
  tipo: "recarga" | "calibracion";
  monto: number;
  fecha?: string | null;
  nota?: string | null;
}): Promise<{ error: string | null }> {
  if (datos.tipo !== "recarga" && datos.tipo !== "calibracion") return { error: "Movimiento no válido" };
  const monto = Number(datos.monto);
  if (!Number.isFinite(monto) || monto < 0 || (datos.tipo === "recarga" && monto <= 0) || monto > 1_000_000) {
    return { error: datos.tipo === "recarga" ? "Ingrese el monto recargado en soles (ej. 1000)" : "Ingrese el saldo que muestra Google en soles" };
  }
  const fecha = fechaValida(datos.fecha);
  if (!fecha) return { error: "La fecha no es válida (no puede ser futura)" };
  const { supabase, user } = await usuario();
  if (!user) return { error: "Sesión expirada" };

  const { data, error } = await supabase
    .from("ads_saldo_movimientos")
    .insert({ tipo: datos.tipo, monto, fecha, nota: datos.nota?.trim() ? datos.nota.trim().slice(0, 300) : null })
    .select("id");
  if (error) return { error: error.code === "42501" ? "Solo gerencia o admin pueden anotar el saldo" : error.message };
  if (!data?.length) return { error: "Solo gerencia o admin pueden anotar el saldo" };
  revalidatePath("/gerencia/marketing");
  return { error: null };
}

export async function borrarMovimientoSaldo(id: string): Promise<{ error: string | null }> {
  const { supabase, user } = await usuario();
  if (!user) return { error: "Sesión expirada" };
  const { data, error } = await supabase.from("ads_saldo_movimientos").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se pudo borrar (solo gerencia o admin)" };
  revalidatePath("/gerencia/marketing");
  return { error: null };
}

export async function cambiarTopeDiarioAds(tope: number): Promise<{ error: string | null }> {
  const n = Number(tope);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) return { error: "Ingrese el tope diario en soles (ej. 250)" };
  const { supabase, user } = await usuario();
  if (!user) return { error: "Sesión expirada" };
  const { data, error } = await supabase
    .from("ads_saldo_config")
    .upsert({ plataforma: "google", tope_diario: n, updated_at: new Date().toISOString(), updated_by: user.id })
    .select("plataforma");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Solo gerencia o admin pueden cambiar el tope" };
  revalidatePath("/gerencia/marketing");
  return { error: null };
}
