import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { codificarInfoAuditoria, COOKIE_AUDITORIA, ranuraDeHost } from "@/lib/auditoria";

/**
 * La puerta de una ranura de auditoría (0160): recibe el token de un solo uso
 * que generó «Entrar como», abre la sesión de la cuenta auditada EN ESTA
 * dirección (ver1…ver5) y manda a la pantalla de inicio de esa persona.
 *
 * Solo responde en un host de auditoría: en crm.efameinsa.com el mismo enlace
 * devuelve 404, para que nunca se pise la sesión de gerencia por error.
 */
export async function GET(request: NextRequest) {
  const ranura = ranuraDeHost(request.headers.get("host"));
  if (!ranura) return new NextResponse("No es una dirección de auditoría", { status: 404 });

  const token = request.nextUrl.searchParams.get("t") ?? "";
  const auditoriaId = request.nextUrl.searchParams.get("a") ?? "";
  if (!token || !/^[0-9a-f-]{36}$/i.test(auditoriaId)) return new NextResponse("Enlace incompleto", { status: 400 });

  const admin = createAdminClient();
  const { data: aud } = await admin
    .from("auditorias_sesion")
    .select("id, ranura, entrada_at, abierta_at, auditor:perfiles!auditorias_sesion_auditor_id_fkey(nombre), auditado:perfiles!auditorias_sesion_auditado_id_fkey(nombre)")
    .eq("id", auditoriaId)
    .maybeSingle();
  if (!aud) return new NextResponse("Esta auditoría no existe", { status: 404 });
  if (aud.entrada_at) return new NextResponse("Este acceso ya se usó. Vuelva a «Entrar como» desde gerencia.", { status: 410 });
  if (Date.now() - new Date(aud.abierta_at as string).getTime() > 10 * 60_000) {
    return new NextResponse("Este acceso venció (10 minutos). Vuelva a «Entrar como» desde gerencia.", { status: 410 });
  }

  // El destino se arma con el Host con que llegó la petición (la ranura), no
  // con la URL interna: detrás de un proxy pueden no coincidir.
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const destino = new URL("/", `${proto}://${request.headers.get("host")}`);
  let response = NextResponse.redirect(destino);

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        response = NextResponse.redirect(destino);
        lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  if (error) return new NextResponse(`No se pudo abrir la sesión: ${error.message}`, { status: 401 });

  const auditor = (aud.auditor as unknown as { nombre: string } | null)?.nombre ?? "gerencia";
  const auditado = (aud.auditado as unknown as { nombre: string } | null)?.nombre ?? "la cuenta";
  await admin.from("auditorias_sesion").update({ entrada_at: new Date().toISOString(), ultimo_visto_at: new Date().toISOString() }).eq("id", auditoriaId);

  // La franja lee esta cookie. Solo informa; la autoridad es la sesión.
  response.cookies.set(COOKIE_AUDITORIA, codificarInfoAuditoria({ id: auditoriaId, auditor, auditado, ranura }), {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
