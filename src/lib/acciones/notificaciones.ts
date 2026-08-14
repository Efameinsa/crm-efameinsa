"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function marcarNotificacionLeida(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notificaciones")
    .update({ leida_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  return { error: null };
}

export async function marcarTodasLeidas(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { error } = await supabase
    .from("notificaciones")
    .update({ leida_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("leida_at", null);
  if (error) return { error: error.message };
  return { error: null };
}

export async function guardarSuscripcionPush(datos: {
  endpoint: string;
  claves: { p256dh: string; auth: string };
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { error } = await supabase.from("push_suscripciones").upsert(
    {
      user_id: user.id,
      endpoint: datos.endpoint,
      claves: datos.claves,
      user_agent: null,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}
