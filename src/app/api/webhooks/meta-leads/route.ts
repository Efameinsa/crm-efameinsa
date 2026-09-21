import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificarLeadEntrante } from "@/lib/notificaciones";
import { avisarLeadNuevoN8n } from "@/lib/avisos-n8n";

// Webhook de formularios instantáneos de Meta Ads (campaña «Clientes
// potenciales»). Santos, 21-09: «los formularios que van a llegar van a
// enviarse al área Central del CRM y Central ya lo derivará con su
// procedimiento». Distinto del WhatsApp: acá nadie escribió, así que no hay
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

const CAMPOS_NOMBRE = new Set(["full_name", "first_name", "last_name", "nombre", "nombre_completo"]);
const CAMPOS_EMAIL = new Set(["email", "correo", "correo_electronico"]);
const CAMPOS_TELEFONO = new Set(["phone_number", "telefono", "celular", "whatsapp", "numero_de_telefono"]);
const CAMPOS_EMPRESA = new Set(["company_name", "empresa", "negocio", "razon_social", "nombre_de_la_empresa"]);

function mapearCampos(campos: { name: string; values: string[] }[]) {
  let nombre = "";
  let primerNombre = "";
  let apellido = "";
  let email = "";
  let telefono = "";
  let razonSocial = "";
  const extras: string[] = [];
  for (const c of campos) {
    const clave = (c.name ?? "").toLowerCase().trim();
    const valor = (c.values ?? []).map((v) => String(v ?? "").trim()).filter(Boolean).join(", ");
    if (!valor) continue;
    if (clave === "full_name" || clave === "nombre" || clave === "nombre_completo") nombre = nombre || valor;
    else if (clave === "first_name") primerNombre = valor;
    else if (clave === "last_name") apellido = valor;
    else if (CAMPOS_EMAIL.has(clave)) email = email || valor;
    else if (CAMPOS_TELEFONO.has(clave)) telefono = telefono || valor;
    else if (CAMPOS_EMPRESA.has(clave)) razonSocial = razonSocial || valor;
    else if (!CAMPOS_NOMBRE.has(clave)) extras.push(`${c.name.replace(/_/g, " ")}: ${valor}`);
  }
  const nombreFinal = nombre || [primerNombre, apellido].filter(Boolean).join(" ").trim();
  return { nombre: nombreFinal, email, telefono, razonSocial, extras };
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

  const { nombre, email, telefono, razonSocial, extras } = mapearCampos(datos.field_data ?? []);
  if (!nombre && !telefono && !email) return;

  const partes = [...extras];
  if (datos.campaign_name) partes.push(`Campaña: ${datos.campaign_name}`);
  if (datos.ad_name) partes.push(`Anuncio: ${datos.ad_name}`);
  partes.push(`Formulario de Meta${datos.platform ? ` (${datos.platform})` : ""}`);

  const { data: creado, error } = await admin
    .from("leads")
    .insert({
      canal: "facebook",
      area_destino: "comercial",
      estado: "pendiente_triaje",
      nombre_contacto: nombre || "Sin nombre",
      telefono: telefono || null,
      email: email || null,
      razon_social: razonSocial || null,
      mensaje: partes.join(" · "),
      fuente: "meta_ads",
      utm_source: "meta",
      utm_medium: "cpc",
      utm_campaign: datos.campaign_id ?? null,
      utm_content: datos.ad_id ?? aviso.ad_id ?? null,
      lead_externo_id: `meta:${leadgenId}`,
      recibido_por: null,
    })
    .select("id, codigo")
    .single();
  if (error) {
    if (error.code !== "23505") console.error("meta-leads: error insertando", error.message);
    return;
  }

  const cuerpo = [nombre || "Sin nombre", razonSocial, datos.campaign_name ?? "Formulario de Meta"].filter(Boolean).join(" · ");
  await notificarLeadEntrante({ titulo: "Nuevo contacto de Meta Ads (formulario)", cuerpo });
  await avisarLeadNuevoN8n({
    titulo: "Nuevo lead de Meta Ads (formulario)",
    codigo: creado.codigo,
    nombre: nombre || "Sin nombre",
    telefono: telefono || null,
    email: email || null,
    canal: "facebook",
    razonSocial: razonSocial || null,
    campania: datos.campaign_name ?? null,
    mensaje: partes.join(" · "),
  });
  console.log(`meta-leads: lead ${creado.codigo} creado desde el formulario de Meta`);
}
