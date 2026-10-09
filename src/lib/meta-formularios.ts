import { createAdminClient } from "@/lib/supabase/admin";
import { notificar, notificarLeadEntrante } from "@/lib/notificaciones";
import { avisarLeadNuevoN8n } from "@/lib/avisos-n8n";

// Un formulario instantáneo de Meta (campaña «Clientes potenciales») se
// convierte en contacto del CRM. Lo usan dos entradas:
//   - /api/webhooks/meta-leads: el webhook de la página (cuando el CRM tenga
//     acceso a la página; hoy no lo tiene, es de otro portafolio).
//   - /api/webhooks/meta-leads-sheets: Meta → Google Sheets → Apps Script
//     (Santos, 09-10-2026).
// Dedupe por `leads.lead_externo_id` = `meta:<id del lead de Meta>`, así un
// mismo formulario que llegue por los dos caminos entra una sola vez.

export interface FormularioMeta {
  leadId: string;
  campos: { name: string; values: string[] }[];
  adId?: string | null;
  adName?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  formName?: string | null;
  platform?: string | null;
}

export type ResultadoFormulario =
  | { estado: "creado"; codigo: string; asignadoA: string | null }
  | { estado: "duplicado" }
  | { estado: "vacio" }
  | { estado: "error"; detalle: string };

const CAMPOS_NOMBRE = new Set(["full_name", "first_name", "last_name", "nombre", "nombre_completo"]);
const CAMPOS_EMAIL = new Set(["email", "correo", "correo_electronico"]);
const CAMPOS_TELEFONO = new Set(["phone_number", "telefono", "celular", "whatsapp", "numero_de_telefono"]);
const CAMPOS_EMPRESA = new Set(["company_name", "empresa", "negocio", "razon_social", "nombre_de_la_empresa"]);

/** Meta antepone el tipo al valor en sus exportaciones («p:+51987654321»). */
function limpiarValor(valor: string): string {
  return valor.replace(/^[a-z]{1,3}:(?=\S)/i, "").trim();
}

/** «¿en_qué_sector_se_encuentra_su_proyecto?» → «En qué sector se encuentra su proyecto». */
function etiquetaDePregunta(nombre: string): string {
  const limpio = nombre.replace(/_/g, " ").replace(/[¿?]/g, "").replace(/\s+/g, " ").trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

export function mapearCampos(campos: { name: string; values: string[] }[]) {
  let nombre = "";
  let primerNombre = "";
  let apellido = "";
  let email = "";
  let telefono = "";
  let razonSocial = "";
  const extras: string[] = [];
  for (const c of campos) {
    const clave = (c.name ?? "").toLowerCase().trim();
    const valor = (c.values ?? []).map((v) => limpiarValor(String(v ?? ""))).filter(Boolean).join(", ");
    if (!valor) continue;
    if (clave === "full_name" || clave === "nombre" || clave === "nombre_completo") nombre = nombre || valor;
    else if (clave === "first_name") primerNombre = valor;
    else if (clave === "last_name") apellido = valor;
    else if (CAMPOS_EMAIL.has(clave)) email = email || valor;
    else if (CAMPOS_TELEFONO.has(clave)) telefono = telefono || valor;
    else if (CAMPOS_EMPRESA.has(clave)) razonSocial = razonSocial || valor;
    else if (!CAMPOS_NOMBRE.has(clave)) extras.push(`${etiquetaDePregunta(c.name)}: ${valor}`);
  }
  const nombreFinal = nombre || [primerNombre, apellido].filter(Boolean).join(" ").trim();
  return { nombre: nombreFinal, email, telefono, razonSocial, extras };
}

interface ResultadoAsignacion {
  resultado: "asignado" | "central" | "retenido_cartera_ajena" | "retenido_sin_turno" | "retenido_error";
  comercial_id?: string;
  comercial_nombre?: string;
  comercial_codigo?: string | null;
  por_cartera?: boolean;
  razon_social?: string | null;
  dueno_nombre?: string;
  dueno_codigo?: string | null;
  oportunidad_id?: string;
  detalle?: string;
}

export async function registrarFormularioMeta(f: FormularioMeta): Promise<ResultadoFormulario> {
  const admin = createAdminClient();
  const externo = `meta:${f.leadId}`;

  const { data: existente } = await admin.from("leads").select("id").eq("lead_externo_id", externo).maybeSingle();
  if (existente) return { estado: "duplicado" };

  const { nombre, email, telefono, razonSocial, extras } = mapearCampos(f.campos);
  if (!nombre && !telefono && !email) return { estado: "vacio" };

  // El anuncio dice de quién es la campaña: en `campanias_whatsapp.campaign_id`
  // va el ID DEL ANUNCIO (igual que para WhatsApp). Si no, se prueba con el de
  // la campaña de Meta, por si se cargó así.
  let codigoCampania: string | null = null;
  for (const id of [f.adId, f.campaignId]) {
    if (!id || codigoCampania) continue;
    const { data } = await admin.from("campanias_whatsapp").select("codigo").eq("campaign_id", id).maybeSingle();
    codigoCampania = data?.codigo ?? null;
  }

  const partes = [...extras];
  if (f.campaignName) partes.push(`Campaña: ${f.campaignName}`);
  if (f.adName) partes.push(`Anuncio: ${f.adName}`);
  if (f.formName) partes.push(`Formulario: ${f.formName}`);
  partes.push(`Formulario de Meta${f.platform ? ` (${f.platform})` : ""}`);
  const mensaje = partes.join(" · ");

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
      mensaje,
      fuente: "meta_ads",
      codigo_campania_wa: codigoCampania,
      plataforma_campania_wa: codigoCampania ? "meta" : null,
      utm_source: "meta",
      utm_medium: "cpc",
      utm_campaign: f.campaignId ?? null,
      utm_content: f.adId ?? null,
      lead_externo_id: externo,
      recibido_por: null,
    })
    .select("id, codigo")
    .single();
  if (error) {
    if (error.code === "23505") return { estado: "duplicado" };
    console.error("formulario de Meta: error insertando", error.message);
    return { estado: "error", detalle: error.message };
  }

  const { data: asignacionData, error: errorAsignacion } = await admin.rpc("asignar_lead_desde_formulario", { p_lead_id: creado.id });
  if (errorAsignacion) console.error("formulario de Meta: asignar_lead_desde_formulario", errorAsignacion.message);
  const asignacion = (asignacionData ?? null) as ResultadoAsignacion | null;

  const quien = [nombre || "Sin nombre", razonSocial, f.campaignName ?? "Formulario de Meta"].filter(Boolean).join(" · ");
  if (asignacion?.resultado === "asignado" && asignacion.comercial_id) {
    await notificar({
      userId: asignacion.comercial_id,
      tipo: "lead_asignado",
      titulo: asignacion.por_cartera
        ? `Su cliente ${asignacion.razon_social ?? ""} llenó un formulario de Meta`.replace(/\s+/g, " ")
        : "Nuevo formulario de campaña para usted",
      cuerpo: `${quien} · ${creado.codigo}`,
      url: asignacion.oportunidad_id ? `/comercial/oportunidades/${asignacion.oportunidad_id}` : "/comercial/oportunidades",
    });
    await notificar({
      rol: "gerencia",
      tipo: "lead_registrado",
      titulo: `Formulario de Meta → ${asignacion.comercial_codigo ?? asignacion.comercial_nombre}`,
      cuerpo: quien,
    });
  } else if (asignacion?.resultado === "retenido_cartera_ajena") {
    await notificarLeadEntrante({
      titulo: `Formulario de Meta retenido: ya es cliente de ${asignacion.dueno_codigo ?? asignacion.dueno_nombre ?? "otro comercial"}`,
      cuerpo: `${quien} · ${asignacion.razon_social ?? ""}`.trim(),
    });
  } else {
    await notificarLeadEntrante({ titulo: "Nuevo contacto de Meta Ads (formulario)", cuerpo: quien });
  }

  await avisarLeadNuevoN8n({
    titulo: "Nuevo lead de Meta Ads (formulario)",
    codigo: creado.codigo,
    nombre: nombre || "Sin nombre",
    telefono: telefono || null,
    email: email || null,
    canal: "facebook",
    razonSocial: razonSocial || null,
    campania: f.campaignName ?? null,
    mensaje,
  });

  return {
    estado: "creado",
    codigo: creado.codigo,
    asignadoA: asignacion?.resultado === "asignado" ? (asignacion.comercial_codigo ?? asignacion.comercial_nombre ?? null) : null,
  };
}
