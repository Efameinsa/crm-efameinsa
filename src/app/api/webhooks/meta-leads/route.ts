import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarFormularioMeta } from "@/lib/meta-formularios";

// Webhook de formularios instantáneos de Meta Ads (campaña «Clientes
// potenciales»). Santos, 21-09: «los formularios que van a llegar van a
// enviarse al área Central del CRM y Central ya lo derivará con su
// procedimiento». Desde la 0428 (09-10) va al comercial dueño de la campaña
// si el anuncio está cargado en `campanias_whatsapp`. Distinto del WhatsApp: acá nadie escribió, así que no hay
// conversación ni turno — entra a la bandeja de triaje como los de Google.
//
// Cómo llega: Meta avisa por el webhook de la PÁGINA (campo `leadgen`) con
// el id del lead, y los datos hay que ir a buscarlos a la Graph API con un
// token que tenga `leads_retrieval` (además de `pages_show_list` y
// `pages_manage_ads`). La app y el token de verificación son los mismos del
// WhatsApp (una sola app, `crm-desarrollador`).
//
// Regla de Meta: responder 200 rápido; si no, reintenta. Dedupe por
// `leads.lead_externo_id` = id del lead de Meta.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token = params.get("hub.verify_token");
  const esperado = process.env.META_VERIFY_TOKEN ?? process.env.WHATSAPP_VERIFY_TOKEN;
  if (params.get("hub.mode") === "subscribe" && token && esperado && token === esperado) {
    return new NextResponse(params.get("hub.challenge"), { status: 200 });
  }
  return NextResponse.json({ error: "Token de verificación inválido" }, { status: 403 });
}

interface CambioLeadgen {
  field?: string;
  value?: { leadgen_id?: string; page_id?: string; form_id?: string; ad_id?: string; adgroup_id?: string; created_time?: number };
}

interface LeadDeMeta {
  id: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
  is_organic?: boolean;
  field_data?: { name: string; values: string[] }[];
}

export async function POST(request: NextRequest) {
  const cuerpoTexto = await request.text();

  const secreto = process.env.META_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET;
  if (secreto) {
    const firma = request.headers.get("x-hub-signature-256");
    const esperada = "sha256=" + crypto.createHmac("sha256", secreto).update(cuerpoTexto).digest("hex");
    const firmaValida =
      !!firma && Buffer.byteLength(firma) === Buffer.byteLength(esperada) && crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
    if (!firmaValida) {
      console.error("meta-leads: firma inválida");
      return NextResponse.json({}, { status: 200 });
    }
  }

  let cuerpo: { object?: string; entry?: { id?: string; changes?: CambioLeadgen[] }[] };
  try {
    cuerpo = JSON.parse(cuerpoTexto);
  } catch {
    return NextResponse.json({});
  }

  try {
    for (const entrada of cuerpo.entry ?? []) {
      for (const cambio of entrada.changes ?? []) {
        if (cambio.field !== "leadgen" || !cambio.value?.leadgen_id) continue;
        await procesarLead(cambio.value.leadgen_id, cambio.value);
      }
    }
  } catch (err) {
    console.error("meta-leads: error procesando", err);
  }
  return NextResponse.json({});
}

async function procesarLead(leadgenId: string, aviso: NonNullable<CambioLeadgen["value"]>) {
  const admin = createAdminClient();

  const { data: existente } = await admin.from("leads").select("id").eq("lead_externo_id", `meta:${leadgenId}`).maybeSingle();
  if (existente) return;

  const token = process.env.META_LEADS_TOKEN ?? process.env.META_ACCESS_TOKEN ?? process.env.WHATSAPP_TOKEN;
  if (!token) {
    console.error("meta-leads: falta META_LEADS_TOKEN / META_ACCESS_TOKEN para leer el formulario");
    return;
  }
  const r = await fetch(
    `https://graph.facebook.com/v21.0/${leadgenId}?fields=id,created_time,ad_id,ad_name,adset_id,campaign_id,campaign_name,form_id,platform,is_organic,field_data&access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(8000) },
  );
  const datos = (await r.json()) as LeadDeMeta & { error?: { message?: string } };
  if (!r.ok || datos.error) {
    console.error("meta-leads: Meta no devolvió el lead", leadgenId, datos.error?.message ?? r.status);
    return;
  }

  // Desde la 0428 el formulario va al comercial dueño de la campaña (o a
  // Central si no tiene), igual que el que llega por Google Sheets.
  const resultado = await registrarFormularioMeta({
    leadId: leadgenId,
    campos: datos.field_data ?? [],
    adId: datos.ad_id ?? aviso.ad_id ?? null,
    adName: datos.ad_name ?? null,
    campaignId: datos.campaign_id ?? null,
    campaignName: datos.campaign_name ?? null,
    platform: datos.platform ?? null,
  });
  if (resultado.estado === "creado") console.log(`meta-leads: lead ${resultado.codigo} creado desde el formulario de Meta`);
}
