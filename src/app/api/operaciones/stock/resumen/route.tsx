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

  let q = supabase.from("stock_cargas").select("id, archivo, filas, estado, empresa, created_at, perfiles:creada_por(nombre)");
  q = cargaId ? q.eq("id", cargaId) : q.in("estado", ["revisando", "subida"]).order("created_at", { ascending: false }).limit(1);
  const { data } = await q.maybeSingle();
  if (!data) return NextResponse.json({ error: "No hay ninguna carga de stock para resumir" }, { status: 404 });

  // La fecha de ingreso que vale es la del almacén (Santos 23-10: «incluir también las fechas de ingreso»).
  const leidas = (data.filas ?? []) as FilaResumen[];
  const series = [...new Set(leidas.map((f) => f.serie).filter((x): x is string => !!x))];
  type DelAlmacen = { ingreso: string | null; observacion: string | null; costo: number | null };
  const ingresoPorSerie = new Map<string, DelAlmacen>();
  for (let i = 0; i < series.length; i += 200) {
    const { data: inv } = await supabase
      .from("inventario_equipos")
      .select("id, serie, ingreso_at, observacion, productos(sku)")
      .in("serie", series.slice(i, i + 200))
      .neq("estado", "baja");
    type Inv = { id: string; serie: string; ingreso_at: string | null; observacion: string | null; productos: { sku: string | null } | { sku: string | null }[] | null };
    const lista = (inv ?? []) as unknown as Inv[];
    // El costo (0596) vive aparte y solo lo leen operaciones y gerencia: este PDF es de ellos.
    const { data: cos } = lista.length ? await supabase.from("inventario_costos").select("inventario_id, costo").in("inventario_id", lista.map((r) => r.id)) : { data: [] };
    const costoDe = new Map(((cos ?? []) as { inventario_id: string; costo: number }[]).map((c) => [c.inventario_id, Number(c.costo)]));
    for (const r of lista) {
      const sku = (Array.isArray(r.productos) ? r.productos[0] : r.productos)?.sku ?? "";
      const d: DelAlmacen = { ingreso: r.ingreso_at, observacion: r.observacion, costo: costoDe.get(r.id) ?? null };
      ingresoPorSerie.set(`${r.serie.toUpperCase()}|${sku}`, d).set(r.serie.toUpperCase(), d);
    }
  }
  const filas = leidas.map((f) => {
    const alm = f.serie
      ? (ingresoPorSerie.get(`${f.serie.toUpperCase()}|${f.codigoFinal ?? f.codigo ?? ""}`) ?? (/^\d{1,3}$/.test(f.serie) ? undefined : ingresoPorSerie.get(f.serie.toUpperCase())))
      : undefined;
    return {
      ...f,
      ingreso: alm?.ingreso || f.ingreso || null,
      costo: alm?.costo ?? (f as { costo?: number | null }).costo ?? null,
      observacion: alm?.observacion ?? null,
    };
  });
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
      empresa={data.empresa ?? "OPEN"}
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
