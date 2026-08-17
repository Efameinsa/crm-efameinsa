import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CANAL_LABEL } from "@/lib/canal-contacto";
import { notificarLeadEntrante } from "@/lib/notificaciones";

// Webhook nativo de Google Ads Lead Forms: Google hace POST directo a esta
// URL en el instante en que el cliente envía el formulario — sin
// intermediarios (Make/Pabbly/n8n), sin límite de operaciones, en tiempo real.
// Especificación: https://developers.google.com/google-ads/webhook/docs/implementation
//
// Contrato de respuesta que exige Google (importante respetarlo):
//   200 + {}                      → recibido, no reintentar
//   4XX + {"message": "..."}      → error permanente, NO reintentar
//   5XX + {"message": "..."}      → error transitorio, SÍ reintentar
// Por eso un lead duplicado responde 200 (está bien manejado, no es error) y
// una caída de base responde 500 (queremos que Google lo reintente).

interface ColumnaUsuario {
  column_id?: string;
  column_name?: string;
  string_value?: string;
}

interface WebhookLead {
  lead_id?: string;
  api_version?: string;
  form_id?: number | string;
  campaign_id?: number | string;
  adgroup_id?: number | string;
  creative_id?: number | string;
  asset_group_id?: number | string;
  gcl_id?: string;
  google_key?: string;
  is_test?: boolean;
  lead_submit_time?: string;
  lead_source?: string;
  user_column_data?: ColumnaUsuario[];
}

// column_id estándar de Google Ads → campo del CRM. Lo que no esté acá no se
// pierde: se acumula en `mensaje` con su etiqueta legible (Google recomienda
// "gracefully ignore unrecognized fields" para no romper si agregan campos).
const CAMPOS_NOMBRE = new Set(["FULL_NAME", "FIRST_NAME", "LAST_NAME"]);
const CAMPOS_EMAIL = new Set(["EMAIL", "WORK_EMAIL"]);
const CAMPOS_TELEFONO = new Set(["PHONE_NUMBER", "WORK_PHONE"]);
const CAMPOS_EMPRESA = new Set(["COMPANY_NAME"]);

function mapearColumnas(columnas: ColumnaUsuario[]) {
  let nombre = "";
  let primerNombre = "";
  let apellido = "";
  let email = "";
  let telefono = "";
  let razonSocial = "";
  const extras: string[] = [];

  for (const c of columnas) {
    const id = (c.column_id ?? "").toUpperCase();
    const valor = (c.string_value ?? "").trim();
    if (!valor) continue;

    if (id === "FULL_NAME") nombre = valor;
    else if (id === "FIRST_NAME") primerNombre = valor;
    else if (id === "LAST_NAME") apellido = valor;
    else if (CAMPOS_EMAIL.has(id)) email = email || valor;
    else if (CAMPOS_TELEFONO.has(id)) telefono = telefono || valor;
    else if (CAMPOS_EMPRESA.has(id)) razonSocial = razonSocial || valor;
    else if (!CAMPOS_NOMBRE.has(id)) {
      extras.push(`${c.column_name || id}: ${valor}`);
    }
  }

  const nombreFinal = nombre || [primerNombre, apellido].filter(Boolean).join(" ").trim();
  return { nombre: nombreFinal, email, telefono, razonSocial, extras };
}

export async function POST(request: NextRequest) {
  let lead: WebhookLead;
  try {
    lead = (await request.json()) as WebhookLead;
  } catch {
    return NextResponse.json({ message: "Cuerpo no es JSON válido" }, { status: 400 });
  }

  // Validación de origen: Google manda la clave que configuramos en el
  // formulario. Sin esto, cualquiera podría inyectar leads falsos.
  const claveEsperada = process.env.GOOGLE_LEADS_WEBHOOK_KEY;
  if (!claveEsperada) {
    console.error("google-leads: falta GOOGLE_LEADS_WEBHOOK_KEY en el entorno");
    return NextResponse.json({ message: "Webhook no configurado" }, { status: 500 });
  }
  if (lead.google_key !== claveEsperada) {
    return NextResponse.json({ message: "Clave inválida" }, { status: 401 });
  }

  // Leads de prueba (botón "Send test data" de Google Ads): se aceptan con
  // 200 para que la validación del formulario pase, pero NO entran a la
  // bandeja de Central como contactos reales.
  if (lead.is_test === true) {
    return NextResponse.json({});
  }

  const { nombre, email, telefono, razonSocial, extras } = mapearColumnas(lead.user_column_data ?? []);
  if (!nombre && !telefono && !email) {
    return NextResponse.json({ message: "Lead sin nombre, teléfono ni correo" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Deduplicación: Google no garantiza entrega exactamente-una-vez. Si ya
  // existe este lead_id, respondemos 200 (manejado correctamente) sin
  // insertar de nuevo.
  if (lead.lead_id) {
    const { data: existente } = await admin
      .from("leads")
      .select("id")
      .eq("lead_externo_id", lead.lead_id)
      .maybeSingle();
    if (existente) return NextResponse.json({});
  }

  // Varios formularios pueden apuntar al mismo webhook (Google los distingue
  // por form_id/campaign_id). Para que Central sepa de dónde viene el lead sin
  // descifrar números, se resuelve el NOMBRE de la campaña contra `campanias`
  // —que ya se sincroniza desde Google Ads— y se guarda eso en el mensaje.
  const partesMensaje = [...extras];
  let nombreCampania: string | null = null;
  if (lead.campaign_id) {
    const { data: campania } = await admin
      .from("campanias")
      .select("nombre")
      .eq("plataforma", "google")
      .eq("campaign_id", String(lead.campaign_id))
      .maybeSingle();
    nombreCampania = campania?.nombre ?? null;
  }
  if (nombreCampania) partesMensaje.push(`Campaña: ${nombreCampania}`);
  else if (lead.campaign_id) partesMensaje.push(`Campaña ID: ${lead.campaign_id}`);
  if (lead.form_id) partesMensaje.push(`Formulario: ${lead.form_id}`);

  const { data: creado, error } = await admin
    .from("leads")
    .insert({
      canal: "formulario_web",
      area_destino: "comercial",
      estado: "pendiente_triaje",
      nombre_contacto: nombre || "Sin nombre",
      telefono: telefono || null,
      email: email || null,
      razon_social: razonSocial || null,
      mensaje: partesMensaje.length > 0 ? partesMensaje.join(" · ") : null,
      fuente: "google_ads",
      gclid: lead.gcl_id || null,
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: lead.campaign_id ? String(lead.campaign_id) : null,
      lead_externo_id: lead.lead_id || null,
      recibido_por: null,
    })
    .select("id, codigo")
    .single();

  if (error) {
    // Carrera entre dos entregas simultáneas del mismo lead: el índice único
    // lo bloquea (23505) y eso ES el comportamiento correcto — no es un fallo
    // que Google deba reintentar.
    if (error.code === "23505") return NextResponse.json({});
    console.error("google-leads: error insertando lead", error.message);
    return NextResponse.json({ message: "Error guardando el lead" }, { status: 500 });
  }

  // Avisa a Central (que debe asignarlo) y a gerencia (que quiere enterarse
  // antes de la derivación, acuerdo de la demo del 14-08). Se incluye la
  // campaña de origen: con varios formularios en paralelo, saber de cuál vino
  // es lo primero que se necesita para decidir a quién asignarlo.
  const cuerpo = [nombre || "Sin nombre", razonSocial, nombreCampania ?? CANAL_LABEL.formulario_web]
    .filter(Boolean)
    .join(" · ");
  await notificarLeadEntrante({ titulo: "Nuevo contacto de Google Ads", cuerpo });

  console.log(`google-leads: lead ${creado.codigo} creado desde Google Ads`);
  return NextResponse.json({});
}
