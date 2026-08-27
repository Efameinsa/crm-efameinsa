import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { lunesSemana } from "@/lib/potenciales-semana";
import { cargarCierreSemanal, sabadoDe } from "@/lib/cierre-semanal";
import { CierreSemanalPdf } from "@/lib/pdf/cierre-semanal-pdf";

/**
 * PDF del cierre de la semana (ing. Carlos, 27-08): lo proyectado contra lo
 * vendido, día por día, con lo que quedó pendiente.
 *
 * Cada quien baja el suyo. Gerencia puede pedir el de otro pasando ?comercial,
 * igual que en el reporte diario — y como allá, quien no sea backoffice solo
 * puede pedir el propio: las consultas van con la sesión del usuario, así que
 * RLS ya filtra, pero se corta acá para no devolver un PDF vacío que parezca
 * una semana sin trabajo.
 */

const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const semanaParam = url.searchParams.get("semana");
  const lunes = lunesSemana(semanaParam && RE_FECHA.test(semanaParam) ? semanaParam : undefined);
  const pedido = url.searchParams.get("comercial");

  if (pedido && pedido !== user.id) {
    const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
    if (!perfil || !["gerencia", "admin", "central"].includes(String(perfil.rol))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }
  const comercialId = pedido ?? user.id;

  const cierre = await cargarCierreSemanal(lunes, comercialId);

  const enLetra = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" });
  const rango = `Del ${enLetra(lunes)} al ${enLetra(sabadoDe(lunes))} de ${lunes.slice(0, 4)}`;

  const buffer = await renderToBuffer(<CierreSemanalPdf logoBuffer={LOGO_BUFFER} rango={rango} cierre={cierre} />);

  const nombre = `Cierre semanal ${cierre.comercial.codigo ?? ""} ${lunes}`.replace(/\s+/g, " ").trim();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": cabeceraArchivo(nombre),
      "Cache-Control": "no-store",
    },
  });
}
