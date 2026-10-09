import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { registrarFormularioMeta, type ResultadoFormulario } from "@/lib/meta-formularios";

// Formularios de Meta que llegan por Google Sheets (Santos, 09-10-2026).
// La página de Facebook es de otro portafolio y el CRM no puede leer sus
// formularios directo; Meta sí los escribe en un Google Sheets, y un Apps
// Script (scripts/apps-script/formularios-meta-al-crm.gs) manda cada fila
// nueva acá, cada 5 minutos.
//
// POST con `Authorization: Bearer <META_SHEETS_CLAVE>` y
//   { filas: [ { "id": "l:123…", "ad_id": "ag:…", "campaign_name": "…",
//                "full_name": "…", "phone_number": "p:+51…", … } ] }
// Cada fila es una fila del Sheets: encabezado → valor. Las columnas que no
// son de Meta (las preguntas del formulario) se guardan en el mensaje.
//
// Responde 200 con el resultado de cada fila; el script marca como enviadas
// las que vuelven «creado», «duplicado» o «vacio». Si la base falla, la fila
// vuelve «error» y el script la reintenta en la siguiente vuelta.

const COLUMNAS_DE_META = new Set([
  "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name",
  "form_id", "form_name", "is_organic", "platform", "lead_status",
  // Las que agrega el Apps Script para su control.
  "enviado_crm", "resultado_crm",
]);

function texto(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** «l:1234» → «1234». Meta antepone el tipo a los ID en sus exportaciones. */
function idDeMeta(v: unknown): string {
  return texto(v).replace(/^[a-z]{1,3}:/i, "");
}

function claveValida(request: NextRequest): boolean {
  const esperada = process.env.META_SHEETS_CLAVE;
  if (!esperada) return false;
  const recibida = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return Buffer.byteLength(recibida) === Buffer.byteLength(esperada) && crypto.timingSafeEqual(Buffer.from(recibida), Buffer.from(esperada));
}

export async function POST(request: NextRequest) {
  if (!process.env.META_SHEETS_CLAVE) {
    console.error("meta-leads-sheets: falta META_SHEETS_CLAVE en el entorno");
    return NextResponse.json({ error: "Entrada no configurada" }, { status: 500 });
  }
  if (!claveValida(request)) return NextResponse.json({ error: "Clave inválida" }, { status: 401 });

  let cuerpo: { filas?: Record<string, unknown>[] };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo no es JSON" }, { status: 400 });
  }
  const filas = Array.isArray(cuerpo.filas) ? cuerpo.filas.slice(0, 200) : [];

  const resultados: { id: string; estado: ResultadoFormulario["estado"] | "sin_id"; codigo?: string; asignado_a?: string | null; detalle?: string }[] = [];
  for (const fila of filas) {
    const id = idDeMeta(fila.id);
    if (!id) {
      resultados.push({ id: "", estado: "sin_id" });
      continue;
    }
    const campos = Object.entries(fila)
      .filter(([clave]) => !COLUMNAS_DE_META.has(clave.toLowerCase().trim()))
      .map(([name, valor]) => ({ name, values: [texto(valor)] }));
    try {
      const r = await registrarFormularioMeta({
        leadId: id,
        campos,
        adId: idDeMeta(fila.ad_id) || null,
        adName: texto(fila.ad_name) || null,
        campaignId: idDeMeta(fila.campaign_id) || null,
        campaignName: texto(fila.campaign_name) || null,
        formName: texto(fila.form_name) || null,
        platform: texto(fila.platform) || null,
      });
      resultados.push(
        r.estado === "creado"
          ? { id, estado: "creado", codigo: r.codigo, asignado_a: r.asignadoA }
          : r.estado === "error"
            ? { id, estado: "error", detalle: r.detalle }
            : { id, estado: r.estado },
      );
    } catch (err) {
      console.error("meta-leads-sheets: error con la fila", id, err);
      resultados.push({ id, estado: "error", detalle: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ resultados });
}
