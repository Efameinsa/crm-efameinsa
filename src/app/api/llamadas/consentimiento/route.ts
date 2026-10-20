import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { VERSION_CONSENTIMIENTO_LLAMADAS } from "@/lib/llamadas-consentimiento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sinCache = { "cache-control": "no-store" };

/**
 * LA ACEPTACIÓN DE LA GRABACIÓN DE LLAMADAS (Santos, 19-10-2026). Con sesión.
 *
 *  GET   ¿aceptó la versión vigente del texto?
 *  POST  { instalacion_id? }  deja escrito que la aceptó (misma tabla que la del GPS, otra versión).
 *
 * Usa la sesión de la persona (no el token del dispositivo). El proxy no toca nada
 * de /api/llamadas, así que la sesión se lee tal cual viene en la cookie.
 */
async function persona() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, id: user.id } : null;
}

export async function GET() {
  const yo = await persona();
  if (!yo) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: sinCache });
  const { data } = await yo.supabase
    .from("consentimientos_rastreo")
    .select("id")
    .eq("user_id", yo.id)
    .eq("version_texto", VERSION_CONSENTIMIENTO_LLAMADAS)
    .eq("aceptado", true)
    .limit(1);
  return NextResponse.json({ consentimiento: (data ?? []).length > 0, version: VERSION_CONSENTIMIENTO_LLAMADAS }, { headers: sinCache });
}

export async function POST(request: Request) {
  const yo = await persona();
  if (!yo) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: sinCache });
  const cuerpo = (await request.json().catch(() => null)) as { instalacion_id?: unknown } | null;
  const instalacion = typeof cuerpo?.instalacion_id === "string" ? cuerpo.instalacion_id.slice(0, 80) : null;
  const { error } = await yo.supabase.from("consentimientos_rastreo").insert({
    user_id: yo.id,
    version_texto: VERSION_CONSENTIMIENTO_LLAMADAS,
    aceptado: true,
    instalacion_id: instalacion,
    user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) return NextResponse.json({ error: "base", detalle: "No se pudo guardar la aceptación." }, { status: 500, headers: sinCache });
  return NextResponse.json({ ok: true, version: VERSION_CONSENTIMIENTO_LLAMADAS }, { headers: sinCache });
}
