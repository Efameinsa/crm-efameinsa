import { NextResponse, type NextRequest } from "next/server";
import { requerirPerfil } from "@/lib/auth";
import { COOKIE_VISTA, esPrecarga } from "@/lib/solo-lectura";

/**
 * Alterna la cuenta de demostración entre la propuesta y el CRM como es hoy
 * (0280). En la vista actual entra por donde entra la cuenta original.
 */
export async function GET(request: NextRequest) {
  // Una precarga no es un clic: no se cambia nada (ver esPrecarga).
  if (esPrecarga(request.headers)) return new NextResponse(null, { status: 204 });
  // ?tema=claro|oscuro: solo cambia el tema de la propuesta y vuelve adonde estaba.
  const tema = request.nextUrl.searchParams.get("tema");
  if (tema === "claro" || tema === "oscuro") {
    const volver = request.headers.get("referer") ?? new URL("/nuevo", request.url).toString();
    const r = NextResponse.redirect(new URL(volver, request.url));
    r.cookies.set("crm-tema", tema, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
    return r;
  }
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
          : ({ admin: "/admin", gerencia: "/gerencia", central: "/central", comercial: "/comercial", operaciones: "/operaciones", finanzas: "/finanzas", facturacion: "/facturacion" } as const)[p.rol];
  }
  const r = NextResponse.redirect(new URL(destino, request.url));
  r.cookies.set(COOKIE_VISTA, actual ? "actual" : "nueva", { path: "/", sameSite: "lax" });
  return r;
}
