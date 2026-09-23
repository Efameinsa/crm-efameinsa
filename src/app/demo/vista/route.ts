import { NextResponse, type NextRequest } from "next/server";
import { requerirPerfil } from "@/lib/auth";
import { COOKIE_VISTA } from "@/lib/solo-lectura";

/**
 * Alterna la cuenta de demostración entre la propuesta y el CRM como es hoy
 * (0280). En la vista actual entra por donde entra la cuenta original.
 */
export async function GET(request: NextRequest) {
  const actual = request.nextUrl.searchParams.get("v") === "actual";
  let destino = "/nuevo";
  if (actual) {
    const p = await requerirPerfil();
    destino = p.es_operaciones
      ? "/operaciones"
      : p.es_almacen
        ? "/almacen"
        : p.es_postventa && p.rol === "comercial"
          ? "/postventa/macro"
          : ({ admin: "/admin", gerencia: "/gerencia", central: "/central", comercial: "/comercial", operaciones: "/operaciones", finanzas: "/finanzas" } as const)[p.rol];
  }
  const r = NextResponse.redirect(new URL(destino, request.url));
  r.cookies.set(COOKIE_VISTA, actual ? "actual" : "nueva", { path: "/", sameSite: "lax" });
  return r;
}
