import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generarToken } from "@/lib/campo-osmand";
import { VERSION_CONSENTIMIENTO } from "@/lib/campo-consentimiento";
import { seRastrea } from "@/lib/campo-rastreo";
import { nombreDelCelular, validarVinculacion } from "@/lib/campo-dispositivo";

export const runtime = "nodejs";

/**
 * LA APP DE ANDROID SE VINCULA SOLA (Santos, 01-10-2026).
 *
 * Con Traccar Client había que copiar un token de 20 letras a mano. La app propia
 * lo hace sola: al iniciar sesión, la pantalla del CRM (dentro de la app) llama
 * acá con la sesión de la persona, y de acá sale el token que el servicio nativo
 * usa en /api/campo/osmand.
 *
 * Con sesión, no sin ella: el token le da a quien lo tiene la llave para anotar
 * posiciones a nombre de esa persona, así que solo se le entrega a ELLA, y solo si
 * gerencia la marcó para el trabajo de campo (`perfiles.trabajo_de_campo`) y aceptó
 * el registro de su ubicación (Ley 29733).
 *
 *  GET  ?instalacion_id=…   ¿está marcada? ¿aceptó la versión vigente? ¿su celular sigue activo?
 *  POST { instalacion_id, modelo, version_app, consentimiento }   → { token, intervalo_s, distancia_m }
 *
 * El rastreo es 24/7 por regla de gerencia (celular de la empresa): no hay horario.
 * Un celular por persona: vincular uno nuevo desactiva el anterior (también un Traccar).
 */

const sinCache = { "cache-control": "no-store" };

/** Cada cuántos segundos pide un punto el GPS de la app. 60 s; las pruebas lo acortan con CAMPO_INTERVALO_S. */
function intervaloRastreoSeg(): number {
  const n = Number(process.env.CAMPO_INTERVALO_S);
  return Number.isFinite(n) && n >= 10 && n <= 600 ? Math.round(n) : 60;
}

async function personaActual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("id, nombre, rol, trabajo_de_campo, es_prueba, rastreo_excluido, activo")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil || perfil.activo === false) return null;
  return {
    supabase,
    perfil: perfil as {
      id: string;
      nombre: string | null;
      rol: string | null;
      trabajo_de_campo: boolean | null;
      es_prueba: boolean | null;
      rastreo_excluido: boolean | null;
    },
  };
}

export async function GET(request: Request) {
  const yo = await personaActual();
  if (!yo) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: sinCache });
  const instalacion = new URL(request.url).searchParams.get("instalacion_id") ?? "";

  const admin = createAdminClient();
  const [{ data: consentimientos }, { data: dispositivo }] = await Promise.all([
    yo.supabase
      .from("consentimientos_rastreo")
      .select("id")
      .eq("user_id", yo.perfil.id)
      .eq("version_texto", VERSION_CONSENTIMIENTO)
      .eq("aceptado", true)
      .limit(1),
    admin
      .from("dispositivos_campo")
      .select("id, activo")
      .eq("user_id", yo.perfil.id)
      .eq("instalacion_id", instalacion)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return NextResponse.json(
    {
      // «marcado» = se la rastrea: toda cuenta real, salvo exclusión de gerencia (lib/campo-rastreo.ts).
      marcado: seRastrea(yo.perfil),
      consentimiento: (consentimientos ?? []).length > 0,
      version_consentimiento: VERSION_CONSENTIMIENTO,
      dispositivo: dispositivo ? { activo: Boolean(dispositivo.activo) } : null,
    },
    { headers: sinCache },
  );
}

export async function POST(request: Request) {
  const yo = await personaActual();
  if (!yo) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: sinCache });
  if (!seRastrea(yo.perfil)) {
    return NextResponse.json({ error: "no_marcado", detalle: "A esta cuenta no se le registra la ubicación." }, { status: 403, headers: sinCache });
  }

  const v = validarVinculacion(await request.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error, detalle: v.detalle }, { status: v.estado, headers: sinCache });
  const { instalacion_id, modelo, version_app } = v.datos;

  // El consentimiento: o la persona acaba de aceptar (se escribe ahora), o ya había aceptado la versión
  // vigente (reinstalar, reabrir). Sin ninguna de las dos no se vincula nada.
  if (v.datos.consentimiento) {
    const agente = request.headers.get("user-agent")?.slice(0, 300) ?? null;
    const { error: errorConsent } = await yo.supabase.from("consentimientos_rastreo").insert({
      user_id: yo.perfil.id,
      version_texto: VERSION_CONSENTIMIENTO,
      aceptado: true,
      instalacion_id,
      user_agent: agente,
    });
    if (errorConsent) {
      return NextResponse.json({ error: "consentimiento", detalle: "No se pudo guardar la aceptación." }, { status: 500, headers: sinCache });
    }
  } else {
    const { data: previo } = await yo.supabase
      .from("consentimientos_rastreo")
      .select("id")
      .eq("user_id", yo.perfil.id)
      .eq("version_texto", VERSION_CONSENTIMIENTO)
      .eq("aceptado", true)
      .limit(1);
    if (!previo?.length) {
      return NextResponse.json({ error: "consentimiento", detalle: "La persona tiene que aceptar el registro de su ubicación." }, { status: 409, headers: sinCache });
    }
  }

  const admin = createAdminClient();
  // ¿Ya está vinculada esta instalación? Se le devuelve el mismo token (la app reintenta o se reabre).
  const { data: existente } = await admin
    .from("dispositivos_campo")
    .select("id, token")
    .eq("user_id", yo.perfil.id)
    .eq("instalacion_id", instalacion_id)
    .eq("activo", true)
    .maybeSingle();

  let token = (existente?.token as string | undefined) ?? null;
  if (!token) {
    // Un celular por persona: el anterior (otra instalación o un Traccar) deja de anotar en el acto.
    const { error: errorViejo } = await admin.from("dispositivos_campo").update({ activo: false }).eq("user_id", yo.perfil.id).eq("activo", true);
    if (errorViejo) return NextResponse.json({ error: "base", detalle: errorViejo.message }, { status: 500, headers: sinCache });
    token = generarToken();
    const { error } = await admin.from("dispositivos_campo").insert({
      user_id: yo.perfil.id,
      token,
      nombre: nombreDelCelular(yo.perfil.nombre, modelo),
      plataforma: "android",
      instalacion_id,
      version_app: version_app ?? null,
    });
    if (error) return NextResponse.json({ error: "base", detalle: error.message }, { status: 500, headers: sinCache });
  } else if (version_app) {
    await admin.from("dispositivos_campo").update({ version_app }).eq("id", existente!.id);
  }

  return NextResponse.json(
    { token, intervalo_s: intervaloRastreoSeg(), distancia_m: 20, version_consentimiento: VERSION_CONSENTIMIENTO },
    { headers: sinCache },
  );
}
