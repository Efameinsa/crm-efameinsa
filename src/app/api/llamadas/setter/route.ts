import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generarToken } from "@/lib/campo-osmand";
import { nombreDelCelular } from "@/lib/campo-dispositivo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sinCache = { "cache-control": "no-store" };

/**
 * EL MODO SETTER DE ESTE CELULAR (Santos, 20-10-2026). Con sesión.
 *
 *  GET   ¿esta cuenta es de setter (`perfiles.setter_llamadas`)? Si no, la app no muestra nada.
 *  POST  { instalacion_id, modelo?, version_app? }  entrega el token con el que el celular
 *        consulta las llamadas por hacer. Reusa el del celular si ya estaba vinculado; si no,
 *        crea uno y desactiva el anterior (un celular por persona, igual que el GPS).
 */
async function persona() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from("perfiles").select("id, nombre, setter_llamadas, activo").eq("id", user.id).maybeSingle();
  if (!perfil || perfil.activo === false) return null;
  return perfil as { id: string; nombre: string | null; setter_llamadas: boolean | null };
}

export async function GET() {
  const yo = await persona();
  if (!yo) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: sinCache });
  return NextResponse.json({ setter: Boolean(yo.setter_llamadas) }, { headers: sinCache });
}

export async function POST(request: Request) {
  const yo = await persona();
  if (!yo) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: sinCache });
  if (!yo.setter_llamadas) return NextResponse.json({ error: "no_setter" }, { status: 403, headers: sinCache });
  const cuerpo = (await request.json().catch(() => null)) as { instalacion_id?: unknown; modelo?: unknown; version_app?: unknown } | null;
  const instalacion = typeof cuerpo?.instalacion_id === "string" ? cuerpo.instalacion_id.trim().slice(0, 80) : "";
  if (instalacion.length < 8) return NextResponse.json({ error: "datos" }, { status: 400, headers: sinCache });
  const modelo = typeof cuerpo?.modelo === "string" ? cuerpo.modelo.slice(0, 60) : undefined;
  const version = typeof cuerpo?.version_app === "string" ? cuerpo.version_app.slice(0, 20) : null;

  const admin = createAdminClient();
  const { data: existente } = await admin
    .from("dispositivos_campo")
    .select("id, token")
    .eq("user_id", yo.id)
    .eq("instalacion_id", instalacion)
    .eq("activo", true)
    .maybeSingle();
  if (existente) {
    if (version) await admin.from("dispositivos_campo").update({ version_app: version }).eq("id", existente.id);
    return NextResponse.json({ token: existente.token }, { headers: sinCache });
  }

  await admin.from("dispositivos_campo").update({ activo: false }).eq("user_id", yo.id).eq("activo", true);
  const token = generarToken();
  const { error } = await admin.from("dispositivos_campo").insert({
    user_id: yo.id,
    token,
    nombre: nombreDelCelular(yo.nombre, modelo),
    plataforma: "android",
    instalacion_id: instalacion,
    version_app: version,
  });
  if (error) return NextResponse.json({ error: "base" }, { status: 500, headers: sinCache });
  return NextResponse.json({ token }, { headers: sinCache });
}
