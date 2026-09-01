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

/**
 * ¿La base conoce esta suscripción?
 *
 * Existe por el caso encontrado el 31-08 con la cuenta de Post Venta: el
 * NAVEGADOR tenía permiso y suscripción viva, pero su fila de la base se
 * había ido (la limpieza del 24-08 borró suscripciones). El aviso de
 * «Activar notificaciones» se ocultaba creyendo que todo estaba bien… y las
 * push jamás llegaban, porque el servidor no tenía a quién mandárselas. El
 * aviso ahora pregunta ACÁ antes de esconderse: suscripción que la base no
 * conoce es suscripción que no existe.
 */
export async function suscripcionRegistrada(endpoint: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("push_suscripciones")
    .select("id")
    .eq("user_id", user.id)
    .eq("endpoint", endpoint)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Apagar los avisos de una pantalla al llegar a ella.
 *
 * Regla: un aviso existe para llevar a la persona a un sitio; cuando ya está
 * en ese sitio, el aviso cumplió y no tiene por qué seguir contando.
 *
 * Nace del reclamo de Brenda del 29-08: la campana marcaba 2 y no había nada
 * que atender. Eran dos prospectos del lunes 24 que ella SÍ llamó (25 y 26 de
 * agosto, «no contestó, insistir mañana») — pero entró por la agenda, no por
 * la campana, así que el aviso se quedó sin leer para siempre y encima quedó
 * enterrado bajo 45 avisos más nuevos.
 *
 * La comparación es EXACTA contra la ruta: estar en el pipeline no apaga el
 * aviso de una oportunidad concreta, solo entrar a esa oportunidad.
 */
export async function marcarLeidasDelDestino(ruta: string): Promise<void> {
  if (!ruta.startsWith("/")) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notificaciones")
    .update({ leida_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("leida_at", null)
    .eq("url", ruta);
}

/**
 * Apagar los avisos de una oportunidad al registrarle una gestión.
 *
 * Complementa a `marcarLeidasDelDestino`: la gestión también se registra desde
 * la agenda y desde la ruta del día, sin pisar la ficha. Si la persona ya
 * llamó al prospecto, el aviso de «nuevo contacto asignado» está atendido,
 * haya entrado por donde haya entrado.
 */
export async function marcarLeidasDeOportunidad(oportunidadId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(oportunidadId)) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notificaciones")
    .update({ leida_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("leida_at", null)
    .like("url", `%/${oportunidadId}`);
}
