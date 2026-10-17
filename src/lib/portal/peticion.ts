import { NextResponse, type NextRequest } from "next/server";
import { CABECERA_FIRMA, CABECERA_TS, verificarFirmaPortal } from "@/lib/portal/firma";

/** Lo más grande que acepta el portal: una foto de recepción en base64 cabe holgada. */
const MAXIMO_CUERPO = 12 * 1024 * 1024;

/** Siempre la misma respuesta cuando no hay cliente: no se dice si el correo existe. */
export function noEncontrado() {
  return NextResponse.json({ ok: false }, { status: 404 });
}

export function rechazo(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Lee el cuerpo crudo, comprueba la firma del portal (firma.ts) y lo parsea.
 * Devuelve el JSON o la respuesta de rechazo lista para devolver.
 */
export async function leerPeticionPortal(request: NextRequest): Promise<{ cuerpo: Record<string, unknown> } | { respuesta: NextResponse }> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return { respuesta: rechazo(415, "Solo JSON") };
  }
  const largo = Number(request.headers.get("content-length") ?? "0");
  if (largo > MAXIMO_CUERPO) return { respuesta: rechazo(413, "Demasiado grande") };
  const crudo = await request.text();
  if (crudo.length > MAXIMO_CUERPO) return { respuesta: rechazo(413, "Demasiado grande") };

  const firma = verificarFirmaPortal({
    secreto: process.env.PORTAL_SECRETO,
    ts: request.headers.get(CABECERA_TS),
    firma: request.headers.get(CABECERA_FIRMA),
    cuerpo: crudo,
  });
  if (!firma.ok) {
    if (firma.motivo === "sin_secreto") console.error("[portal] PORTAL_SECRETO no está configurado (o es muy corto)");
    return { respuesta: rechazo(401, "Firma inválida") };
  }

  try {
    const cuerpo = JSON.parse(crudo) as unknown;
    if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return { respuesta: rechazo(400, "JSON inválido") };
    return { cuerpo: cuerpo as Record<string, unknown> };
  } catch {
    return { respuesta: rechazo(400, "JSON inválido") };
  }
}

export function texto(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Solo POST: lo demás no existe para el portal. */
export function soloPost() {
  return NextResponse.json({ ok: false, error: "Solo POST" }, { status: 405, headers: { Allow: "POST" } });
}
