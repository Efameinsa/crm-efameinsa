import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * La Conversions API de Meta (plan de campañas 2026-IV, fase 0; sección 2.8
 * del plan de WhatsApp del 14-09). Meta optimiza por lo que le contamos: si
 * solo ve «conversación iniciada», persigue conversaciones; si le decimos
 * quién cotizó y quién compró, persigue eso.
 *
 * Cuatro eventos, siempre mejor esfuerzo (nunca frena la acción que lo
 * dispara; lo que pasó queda en `eventos_meta`):
 *   Contact           → llegó una conversación de WhatsApp desde un anuncio
 *   Lead              → Central/comercial tipificó «interesado»
 *   SubmitApplication → se emitió una cotización (o tipificación «cotizado»)
 *   Purchase          → se emitió el informe de cierre de venta, con valor
 *
 * Identidad: teléfono y correo hasheados (SHA-256, como exige Meta), las
 * galletas del píxel (fbp/fbc) si la web las mandó, y el `ctwa_clid` del
 * anuncio de WhatsApp si lo hay. Sin META_CAPI_TOKEN no manda nada y no
 * escribe nada: el sistema funciona igual sin Meta.
 */
const VERSION = "v21.0";
const PIXEL = process.env.META_PIXEL_ID ?? "1618673592793365";

export type EventoMeta = "Contact" | "Lead" | "SubmitApplication" | "Purchase";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const telNormal = (t: string | null | undefined) => {
  if (!t) return null;
  let d = t.replace(/\D/g, "");
  if (d.length === 9) d = "51" + d; // Perú sin código de país
  return d.length >= 10 ? d : null;
};

export async function enviarEventoMeta(datos: {
  evento: EventoMeta;
  leadId: string;
  /** Único por lead+evento: Meta deduplica con él (p. ej. `PRO-09464:Lead`). */
  eventId: string;
  valor?: number | null;
  moneda?: string;
}): Promise<void> {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return;
  const admin = createAdminClient();

  // Ya se mandó este mismo evento: no se repite (Meta lo deduplicaría igual, pero no gastamos la llamada).
  const { data: previo } = await admin.from("eventos_meta").select("id").eq("event_id", datos.eventId).maybeSingle();
  if (previo) return;

  const { data: lead } = await admin
    .from("leads")
    .select("id, telefono, email, fbp, fbc, fbclid, recibido_at, codigo")
    .eq("id", datos.leadId)
    .maybeSingle();
  if (!lead) return;
  const { data: conv } = await admin.from("wa_conversaciones").select("ctwa_clid").eq("lead_id", datos.leadId).not("ctwa_clid", "is", null).limit(1).maybeSingle();

  const userData: Record<string, unknown> = {};
  const tel = telNormal(lead.telefono);
  if (tel) userData.ph = [sha(tel)];
  if (lead.email) userData.em = [sha(String(lead.email).trim().toLowerCase())];
  if (lead.fbp) userData.fbp = lead.fbp;
  if (lead.fbc) userData.fbc = lead.fbc;
  else if (lead.fbclid) userData.fbc = `fb.1.${Date.parse(lead.recibido_at as string) || Date.now()}.${lead.fbclid}`;
  if (conv?.ctwa_clid) userData.ctwa_clid = conv.ctwa_clid;
  if (!userData.ph && !userData.em && !userData.ctwa_clid) return; // sin identidad no hay con qué casarlo

  const cuerpo = {
    data: [
      {
        event_name: datos.evento,
        event_time: Math.floor(Date.now() / 1000),
        event_id: datos.eventId,
        // Desde WhatsApp (anuncio de mensajes) o desde el sistema (cotización, venta).
        action_source: conv?.ctwa_clid ? "business_messaging" : "system_generated",
        ...(conv?.ctwa_clid ? { messaging_channel: "whatsapp" } : {}),
        user_data: userData,
        ...(datos.valor != null ? { custom_data: { value: Number(datos.valor), currency: datos.moneda ?? "USD" } } : {}),
      },
    ],
    ...(process.env.META_CAPI_TEST_CODE ? { test_event_code: process.env.META_CAPI_TEST_CODE } : {}),
  };

  let respuesta: unknown = null;
  let error: string | null = null;
  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${PIXEL}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(8000),
    });
    respuesta = await r.json();
    if (!r.ok) error = (respuesta as { error?: { message?: string } })?.error?.message ?? `HTTP ${r.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await admin.from("eventos_meta").insert({ lead_id: datos.leadId, evento: datos.evento, event_id: datos.eventId, valor: datos.valor ?? null, respuesta, error });
  if (error) console.error("meta-capi:", datos.evento, lead.codigo, error);
}
