import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { hoyLima } from "@/lib/periodo";
import { cargarCierreMensual, esMes, mesPorDefecto } from "@/lib/cierre-mensual";
import { CierreMensualPdf } from "@/lib/pdf/cierre-mensual-pdf";

/**
 * PDF del reporte del mes del comercial (ing. Carlos, 31-08: «que los
 * comerciales también puedan descargar su reporte mensual»).
 *
 * Mismo camino que el cierre semanal y que el reporte diario: cada quien baja
 * el suyo, gerencia puede pedir el de otro pasando ?comercial, y quien no sea
 * backoffice se corta acá —las consultas van con la sesión del usuario, así
 * que RLS ya filtra, pero devolver un PDF vacío parecería un mes sin trabajo.
 */

const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const mesParam = url.searchParams.get("mes");
  const mes = esMes(mesParam) ? mesParam! : mesPorDefecto(hoyLima());
  const pedido = url.searchParams.get("comercial");

  if (pedido && pedido !== user.id) {
    const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
    if (!perfil || !["gerencia", "admin", "central"].includes(String(perfil.rol))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }
  const comercialId = pedido ?? user.id;

  const cierre = await cargarCierreMensual(mes, comercialId);
  const buffer = await renderToBuffer(<CierreMensualPdf logoBuffer={LOGO_BUFFER} cierre={cierre} />);

  const nombre = `Reporte mensual ${cierre.comercial.codigo ?? ""} ${mes}`.replace(/\s+/g, " ").trim();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      // inline: se abre en el visor del navegador y desde ahí se descarga o se
      // adjunta al correo, que es como trabajan.
      "Content-Disposition": cabeceraArchivo(nombre),
      "Cache-Control": "no-store",
    },
  });
}
