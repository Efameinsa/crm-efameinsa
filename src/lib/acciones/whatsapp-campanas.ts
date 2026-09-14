"use server";

// WhatsApp de campañas, fase 1 (14-09-2026): sin API, con el código del
// mensaje prellenado del anuncio. Plan completo en
// Downloads/plan-whatsapp-api-crm.md — PENDIENTE DE APROBACIÓN DE GERENCIA.
//
// Este archivo tiene dos responsabilidades separadas a propósito:
//   · El catálogo de códigos (`campanias_whatsapp`): lo carga quien
//     administra marketing (backoffice); todos los demás solo lo leen para
//     elegir un código al registrar un contacto.
//   · La tipificación del resultado de la conversación: la registra Central o
//     el comercial al que se le asignó ese contacto — nunca en nombre de otro.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TipificacionWhatsapp } from "@/lib/whatsapp-marketing";

export interface CampaniaWhatsapp {
  id: string;
  codigo: string;
  nombre: string;
  plataforma: "meta" | "google" | "otro";
  campaign_id: string | null;
  mensaje_prellenado: string | null;
  activa: boolean;
  created_at: string;
}

/** Para los formularios de registro: solo las que están activas hoy. */
export async function campaniasWhatsappActivas(): Promise<CampaniaWhatsapp[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campanias_whatsapp")
    .select("id, codigo, nombre, plataforma, campaign_id, mensaje_prellenado, activa, created_at")
    .eq("activa", true)
    .order("codigo");
  return (data ?? []) as CampaniaWhatsapp[];
}

/** Para la pantalla de administración: todas, activas e inactivas. */
export async function listarCampaniasWhatsapp(): Promise<CampaniaWhatsapp[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campanias_whatsapp")
    .select("id, codigo, nombre, plataforma, campaign_id, mensaje_prellenado, activa, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as CampaniaWhatsapp[];
}

export async function crearCampaniaWhatsapp(formData: FormData): Promise<{ error: string | null }> {
  const codigo = String(formData.get("codigo") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const plataforma = String(formData.get("plataforma") ?? "");
  const campaignId = String(formData.get("campaign_id") ?? "").trim();
  const mensajePrellenado = String(formData.get("mensaje_prellenado") ?? "").trim();

  if (!codigo) return { error: "Falta el código (ej.: M1-A)" };
  if (!nombre) return { error: "Falta el nombre de la campaña" };
  if (!["meta", "google", "otro"].includes(plataforma)) return { error: "Elija la plataforma" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { error } = await supabase.from("campanias_whatsapp").insert({
    codigo,
    nombre,
    plataforma,
    campaign_id: campaignId || null,
    mensaje_prellenado: mensajePrellenado || null,
    creado_por: user.id,
  });

  if (error) {
    // El índice único es sobre upper(codigo): un choque ahí es casi siempre
    // "ya existe ese código", que es más útil decir así que con el 23505 crudo.
    if (error.code === "23505") return { error: `Ya existe un código "${codigo}"` };
    return { error: error.message };
  }

  revalidatePath("/gerencia/marketing/whatsapp");
  return { error: null };
}

export async function actualizarCampaniaWhatsapp(
  id: string,
  formData: FormData,
): Promise<{ error: string | null }> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const mensajePrellenado = String(formData.get("mensaje_prellenado") ?? "").trim();
  const activa = formData.get("activa") === "true";

  if (!nombre) return { error: "Falta el nombre de la campaña" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("campanias_whatsapp")
    .update({ nombre, mensaje_prellenado: mensajePrellenado || null, activa })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/gerencia/marketing/whatsapp");
  return { error: null };
}

export type { TipificacionWhatsapp };

/**
 * Marca el resultado de la conversación. Se guarda como una fila NUEVA, no un
 * update: así queda quién dijo qué y cuándo, y si el vendedor se equivoca al
 * marcar, la corrección es otra fila con la hora de verdad — no se pierde el
 * primer intento.
 *
 * La excepción "continuado por mi línea" exige la nota (el motivo): es la
 * salida permitida cuando el vendedor sigue la conversación por su WhatsApp
 * personal en vez de la bandeja del CRM, y el plan de gerencia pide que quede
 * anotada, no que pase en silencio.
 */
export async function tipificarWhatsApp(
  leadId: string,
  estado: TipificacionWhatsapp,
  nota?: string,
): Promise<{ error: string | null }> {
  if (estado === "continuado_por_mi_linea" && !nota?.trim()) {
    return { error: "Escriba por qué sigue la conversación fuera del CRM." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { error } = await supabase.from("tipificaciones_whatsapp").insert({
    lead_id: leadId,
    estado,
    nota: nota?.trim() || null,
    registrado_por: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/central");
  revalidatePath("/central/derivados");
  revalidatePath("/comercial/oportunidades/[id]", "page");
  return { error: null };
}

export interface TipificacionActual {
  lead_id: string;
  estado: TipificacionWhatsapp;
  nota: string | null;
  registrado_por: string;
  registrado_por_nombre: string | null;
  registrado_at: string;
}

/** El estado vigente (el más reciente) de una lista de leads, en un solo viaje. */
export async function tipificacionesActuales(leadIds: string[]): Promise<TipificacionActual[]> {
  if (leadIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("tipificacion_whatsapp_actual")
    .select("lead_id, estado, nota, registrado_por, registrado_at, perfiles(nombre)")
    .in("lead_id", leadIds);
  return (data ?? []).map((f) => ({
    lead_id: f.lead_id as string,
    estado: f.estado as TipificacionWhatsapp,
    nota: f.nota as string | null,
    registrado_por: f.registrado_por as string,
    registrado_por_nombre: (f.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
    registrado_at: f.registrado_at as string,
  }));
}
