import { NextResponse, type NextRequest } from "next/server";
import { createClientReal } from "@/lib/supabase/server";
import { COOKIE_DEMO, COOKIE_VISTA, esPrecarga } from "@/lib/solo-lectura";

/**
 * Cierra la sesión de la cuenta de demostración (0280) — la de quien está en
 * el navegador, solo en este equipo. Nunca la de la cuenta original: el
 * cierre de Supabase por defecto es global y la sacaría de todos sus equipos.
 */
export async function GET(request: NextRequest) {
  // Una precarga no es un clic: no se cierra nada (ver esPrecarga).
  if (esPrecarga(request.headers)) return new NextResponse(null, { status: 204 });
  const supabase = await createClientReal();
  await supabase.auth.signOut({ scope: "local" });
  const r = NextResponse.redirect(new URL("/login", request.url));
  r.cookies.delete(COOKIE_DEMO);
  r.cookies.delete(COOKIE_VISTA);
  return r;
}
