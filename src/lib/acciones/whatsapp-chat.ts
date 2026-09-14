"use server";

// Bandeja de chat de WhatsApp (fase 2, 15-09-2026). Plan completo en
// Downloads/plan-whatsapp-api-crm.md, sección 2.6 — PENDIENTE DE APROBACIÓN
// DE GERENCIA PARA USAR EN PRODUCCIÓN (falta que Meta apruebe la
// verificación del negocio; mientras tanto se prueba con el número de
// pruebas gratuito de Meta, ver Downloads/guia-verificacion-meta-whatsapp.md).
//
// La visibilidad de qué conversación ve cada quien la decide RLS
// (`wa_conversaciones_central`, `wa_conversaciones_comercial`, 0233) — este
// archivo nunca filtra por rol a mano, para que no se desalinee de la
// política real.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { enviarTexto } from "@/lib/whatsapp";

export interface ConversacionWhatsapp {
  id: string;
  telefono: string;
  nombre_wa: string | null;
  lead_id: string | null;
  asignado_a: string | null;
  asignado_a_nombre: string | null;
  estado: "sin_atender" | "en_gestion" | "cerrada";
  ultimo_mensaje_cliente_at: string | null;
  ultimo_mensaje_at: string | null;
  codigo_campania_wa: string | null;
  ultimo_texto: string | null;
}

export type FiltroConversaciones = "sin_atender" | "mias" | "todas" | "cerradas";

export async function conversacionesDe(filtro: FiltroConversaciones): Promise<ConversacionWhatsapp[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let consulta = supabase
    .from("wa_conversaciones")
    .select("id, telefono, nombre_wa, lead_id, asignado_a, estado, ultimo_mensaje_cliente_at, ultimo_mensaje_at, codigo_campania_wa, perfiles(nombre)")
    .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false });

  if (filtro === "sin_atender") consulta = consulta.eq("estado", "sin_atender");
  else if (filtro === "mias") consulta = consulta.eq("asignado_a", user.id).neq("estado", "cerrada");
  else if (filtro === "cerradas") consulta = consulta.eq("estado", "cerrada");
  else consulta = consulta.neq("estado", "cerrada");

  const { data } = await consulta;
  if (!data) return [];

  const conIds = data.map((c) => c.id);
  const ultimos = new Map<string, string>();
  if (conIds.length > 0) {
    const { data: mensajes } = await supabase
      .from("wa_mensajes")
      .select("conversacion_id, texto, created_at")
      .in("conversacion_id", conIds)
      .order("created_at", { ascending: false });
    for (const m of mensajes ?? []) {
      if (!ultimos.has(m.conversacion_id)) ultimos.set(m.conversacion_id, m.texto ?? "(sin texto)");
    }
  }

  return data.map((c) => ({
    id: c.id,
    telefono: c.telefono,
    nombre_wa: c.nombre_wa,
    lead_id: c.lead_id,
    asignado_a: c.asignado_a,
    asignado_a_nombre: (c.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
    estado: c.estado,
    ultimo_mensaje_cliente_at: c.ultimo_mensaje_cliente_at,
    ultimo_mensaje_at: c.ultimo_mensaje_at,
    codigo_campania_wa: c.codigo_campania_wa,
    ultimo_texto: ultimos.get(c.id) ?? null,
  }));
}

export interface ConversacionDetalle extends ConversacionWhatsapp {
  lead_codigo: string | null;
  lead_nombre_contacto: string | null;
}

export async function conversacionPorId(id: string): Promise<ConversacionDetalle | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wa_conversaciones")
    .select(
      "id, telefono, nombre_wa, lead_id, asignado_a, estado, ultimo_mensaje_cliente_at, ultimo_mensaje_at, codigo_campania_wa, perfiles(nombre), leads(codigo, nombre_contacto)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const lead = data.leads as unknown as { codigo: string; nombre_contacto: string } | null;
  return {
    id: data.id,
    telefono: data.telefono,
    nombre_wa: data.nombre_wa,
    lead_id: data.lead_id,
    asignado_a: data.asignado_a,
    asignado_a_nombre: (data.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
    estado: data.estado,
    ultimo_mensaje_cliente_at: data.ultimo_mensaje_cliente_at,
    ultimo_mensaje_at: data.ultimo_mensaje_at,
    codigo_campania_wa: data.codigo_campania_wa,
    ultimo_texto: null,
    lead_codigo: lead?.codigo ?? null,
    lead_nombre_contacto: lead?.nombre_contacto ?? null,
  };
}

export interface MensajeWhatsapp {
  id: string;
  wamid: string | null;
  direccion: "entrante" | "saliente";
  tipo: string;
  texto: string | null;
  estado: string;
  enviado_por_nombre: string | null;
  timestamp_meta: string | null;
  created_at: string;
}

export async function mensajesDe(conversacionId: string): Promise<MensajeWhatsapp[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wa_mensajes")
    .select("id, wamid, direccion, tipo, texto, estado, timestamp_meta, created_at, perfiles(nombre)")
    .eq("conversacion_id", conversacionId)
    .order("created_at");
  return (data ?? []).map((m) => ({
    id: m.id,
    wamid: m.wamid,
    direccion: m.direccion,
    tipo: m.tipo,
    texto: m.texto,
    estado: m.estado,
    enviado_por_nombre: (m.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
    timestamp_meta: m.timestamp_meta,
    created_at: m.created_at,
  }));
}

export async function enviarMensajeChat(conversacionId: string, texto: string): Promise<{ error: string | null }> {
  if (!texto.trim()) return { error: "Escriba un mensaje" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { data: conversacion } = await supabase
    .from("wa_conversaciones")
    .select("telefono, estado")
    .eq("id", conversacionId)
    .maybeSingle();
  if (!conversacion) return { error: "La conversación ya no existe" };

  const resultado = await enviarTexto(conversacionId, conversacion.telefono, texto.trim(), user.id);
  if (resultado.error) return resultado;

  // El primer mensaje que manda alguien pasa la conversación a "en gestión"
  // — deja de contar como "sin atender".
  if (conversacion.estado === "sin_atender") {
    await supabase.from("wa_conversaciones").update({ estado: "en_gestion" }).eq("id", conversacionId);
  }

  revalidatePath(`/whatsapp/${conversacionId}`);
  revalidatePath("/whatsapp");
  return { error: null };
}

/** Central deriva la conversación a un comercial — mismo criterio que derivar un lead. */
export async function derivarConversacion(conversacionId: string, comercialId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("wa_conversaciones")
    .update({ asignado_a: comercialId, estado: "en_gestion" })
    .eq("id", conversacionId);
  if (error) return { error: error.message };

  revalidatePath(`/whatsapp/${conversacionId}`);
  revalidatePath("/whatsapp");
  return { error: null };
}

export async function cerrarConversacion(conversacionId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("wa_conversaciones").update({ estado: "cerrada" }).eq("id", conversacionId);
  if (error) return { error: error.message };

  revalidatePath(`/whatsapp/${conversacionId}`);
  revalidatePath("/whatsapp");
  return { error: null };
}

export async function reabrirConversacion(conversacionId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("wa_conversaciones").update({ estado: "sin_atender" }).eq("id", conversacionId);
  if (error) return { error: error.message };

  revalidatePath(`/whatsapp/${conversacionId}`);
  revalidatePath("/whatsapp");
  return { error: null };
}
