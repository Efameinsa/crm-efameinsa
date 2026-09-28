import { NextResponse, type NextRequest } from "next/server";
import { createClientReal } from "@/lib/supabase/server";
import { esPrecarga } from "@/lib/solo-lectura";

/**
 * CUENTA DESACTIVADA (28-09-2026). Desactivar a alguien en el admin marcaba
 * `perfiles.activo = false`, pero nada lo miraba: la persona seguía entrando.
 * requerirPerfil() la manda acá, y acá se cierra su sesión en TODOS sus equipos
 * (scope global: revoca los tokens de renovación) y vuelve al login.
 */
export async function GET(request: NextRequest) {
  // Una precarga no es un clic: no se cierra nada (ver esPrecarga).
  if (esPrecarga(request.headers)) return new NextResponse(null, { status: 204 });
  const supabase = await createClientReal();
  await supabase.auth.signOut({ scope: "global" });
  return NextResponse.redirect(new URL("/login", request.url));
}
