import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { fechaHoraLima } from "@/lib/fechas";
import { ResumenStockPdf, type FilaResumen } from "@/lib/pdf/resumen-stock-pdf";

// El «Resumen general de stock» en PDF (Santos 21-10): la revisión que Lesly
// tiene abierta en «Stock y códigos», en el formato de la hoja impresa de
// Importaciones. Lo puede bajar operaciones, gerencia o admin (la carga solo
// la leen ellos: RLS de stock_cargas, 0576).
const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));

export async function GET(request: Request) {
  const perfil = await requerirPerfil();
  if (!(["operaciones", "gerencia", "admin"].includes(perfil.rol) || perfil.es_operaciones)) {
    return NextResponse.json({ error: "El resumen de stock es de operaciones" }, { status: 403 });
  }
  const supabase = await createClient();
  const cargaId = new URL(request.url).searchParams.get("carga");

  let q = supabase.from("stock_cargas").select("id, archivo, filas, estado, created_at, perfiles:creada_por(nombre)");
  q = cargaId ? q.eq("id", cargaId) : q.in("estado", ["revisando", "subida"]).order("created_at", { ascending: false }).limit(1);
  const { data } = await q.maybeSingle();
  if (!data) return NextResponse.json({ error: "No hay ninguna carga de stock para resumir" }, { status: 404 });

  const filas = (data.filas ?? []) as FilaResumen[];
  // Para marcar «nuevo»: el código a usar que todavía no está en el catálogo.
  const { data: productos } = await supabase.from("productos").select("sku").not("sku", "is", null);
  const existentes = new Set((productos ?? []).map((p) => String(p.sku).toUpperCase()));

  const autor = (Array.isArray(data.perfiles) ? data.perfiles[0] : data.perfiles) as { nombre?: string } | null;
  const buffer = await renderToBuffer(
    <ResumenStockPdf
      logoBuffer={LOGO_BUFFER}
      archivo={data.archivo}
      generado={fechaHoraLima(new Date().toISOString())}
      por={autor?.nombre ?? perfil.nombre ?? "operaciones"}
      estadoCarga={data.estado}
      filas={filas}
      existentes={existentes}
    />,
  );

  const fecha = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Lima" });
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": cabeceraArchivo(`Resumen general de stock ${fecha}`, "pdf", true),
      "Cache-Control": "no-store",
    },
  });
}
