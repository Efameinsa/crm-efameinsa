import { NextResponse } from "next/server";
import { empresaValida, logoDeEmpresa } from "@/lib/pdf/logo-empresa";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPerfil } from "@/lib/auth";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { fechaHoraLima } from "@/lib/fechas";
import { StockGeneralPdf } from "@/lib/pdf/stock-general-pdf";
import type { FilaStockGeneral } from "@/lib/stock-general";
import type { FilaCarga } from "@/lib/acciones/stock-importaciones";

// El «Resumen general de stock» con el formato de Importaciones (reunión
// Santos–Lesly 22-10): ?doc=industriales (por proveedor y tipo) o ?doc=lg
// (consolidado por modelo). Sale del ALMACÉN (lo que Lesly subió con su Excel
// y sigue disponible), así que lo puede bajar cualquiera: es el informe que
// Importaciones entregaba a las comerciales. Con ?carga=<id>, operaciones ve
// una VISTA PREVIA de lo que va a subir de una carga en revisión. Sin costos.

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const deCarga = (f: FilaCarga): FilaStockGeneral => ({
  item: f.item,
  codigo: f.codigoFinal ?? f.codigo,
  modelo: f.modelo,
  descripcion: f.descripcion,
  serie: f.serie,
  cantidad: f.cantidad,
  ubicacion: f.ubicacion,
  marca: f.marca,
  proveedor: f.proveedor ?? null,
  esLg: /LG/i.test(f.hoja),
});

/** El stock de UNA empresa sacado del almacén (más las piezas sin serie del último Excel de esa empresa). */
async function delAlmacen(supabase: Awaited<ReturnType<typeof createClient>>, empresa: "OPEN" | "EFAMEINSA") {
  const filas: FilaStockGeneral[] = [];
  const avisos: string[] = [];
  let origen = "";
  // El almacén: una fila por máquina disponible, con lo que Importaciones dijo de ella (0584).
  const { data: inv } = await supabase
    .from("inventario_equipos")
    .select("serie, ubicacion, item_importaciones, descripcion, modelo, capacidad, proveedor, productos(sku, marca, modelo, nombre, segmento, dm:ficha->>descripcion_maestro)")
    .eq("estado", "disponible")
    .eq("empresa", empresa);
  type Inv = {
    serie: string; ubicacion: string | null; item_importaciones: string | null; descripcion: string | null; modelo: string | null; proveedor: string | null;
    productos: Uno<{ sku: string | null; marca: string | null; modelo: string | null; nombre: string; segmento: string | null; dm: string | null }>;
  };
  for (const i of (inv ?? []) as unknown as Inv[]) {
    const p = uno(i.productos);
    const marca = i.proveedor === "LG" ? "LG" : (p?.marca ?? null);
    filas.push({
      item: i.item_importaciones,
      codigo: p?.sku ?? null,
      modelo: i.modelo ?? p?.modelo ?? "",
      descripcion: i.descripcion ?? p?.dm ?? p?.nombre ?? "",
      serie: i.serie,
      cantidad: 1,
      ubicacion: i.ubicacion,
      marca,
      proveedor: i.proveedor,
      // LG es la marca, no el segmento: un calderín Sidi Mondial «semi-industrial» no es LG.
      esLg: /^LG$/i.test(marca ?? "") || /^LG$/i.test(i.proveedor ?? ""),
    });
  }
  // Las piezas sin serie de placa (mesas, coches) no entran al almacén por serie:
  // vienen del último Excel subido, con su cantidad.
  const admin = createAdminClient();
  const { data: ultima } = await admin
    .from("stock_cargas")
    .select("archivo, filas, subida_at")
    // Desde 0588 lo claro entra al leer el Excel y la carga sigue «revisando» mientras
    // queden observaciones: también cuenta como Excel subido (Santos 23-10: el PDF decía
    // «todavía no se subió ningún Excel» con 35 máquinas ya en el almacén).
    .in("estado", ["subida", "revisando"])
    .not("subida_at", "is", null)
    .eq("es_prueba", false)
    .eq("empresa", empresa)
    .order("subida_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultima) {
    const sinSerie = ((ultima.filas ?? []) as FilaCarga[]).filter((f) => f.decision === "subir" && !f.serie && f.cantidad > 0);
    filas.push(...sinSerie.map(deCarga));
    origen = `Último Excel subido: ${ultima.archivo}${ultima.subida_at ? ` (${fechaHoraLima(ultima.subida_at)})` : ""}`;
  } else {
    origen = "Todavía no se subió ningún Excel de stock";
  }
  if (filas.length === 0) avisos.push("El almacén no tiene máquinas disponibles todavía.");
  return { filas, origen, avisos };
}

const logoDe = (e: "OPEN" | "EFAMEINSA") => { const l = logoDeEmpresa(e); return { logoBuffer: l.buffer, logoAncho: l.ancho }; };

export async function GET(request: Request) {
  const perfil = await requerirPerfil();
  const url = new URL(request.url);
  const doc = url.searchParams.get("doc") === "lg" ? "lg" : "industriales";
  const cargaId = url.searchParams.get("carga");
  // Un resumen por empresa, con su logo (Santos 23-10): el stock de Open y el de Efameinsa no se mezclan.
  let empresa = empresaValida(url.searchParams.get("empresa"));
  // ?empresa=TODAS: el consolidado, Open primero y Efameinsa después.
  const consolidado = !url.searchParams.get("carga") && String(url.searchParams.get("empresa") ?? "").toUpperCase() === "TODAS";
  const secciones: NonNullable<Parameters<typeof StockGeneralPdf>[0]["secciones"]> = [];
  const supabase = await createClient();

  let filas: FilaStockGeneral[] = [];
  let origen = "";
  let vistaPrevia = false;
  const avisos: string[] = [];

  if (cargaId) {
    if (!(["operaciones", "gerencia", "admin"].includes(perfil.rol) || perfil.es_operaciones)) {
      return NextResponse.json({ error: "La vista previa de una carga es de operaciones" }, { status: 403 });
    }
    const { data } = await supabase.from("stock_cargas").select("id, archivo, filas, estado, empresa").eq("id", cargaId).maybeSingle();
    if (!data) return NextResponse.json({ error: "No existe esa carga de stock" }, { status: 404 });
    empresa = empresaValida(data.empresa);
    const todas = (data.filas ?? []) as FilaCarga[];
    filas = todas.filter((f) => f.decision === "subir" && (f.codigoFinal ?? f.codigo)).map(deCarga);
    vistaPrevia = data.estado === "revisando";
    origen = `Carga: ${data.archivo}`;
    const sinDecidir = todas.filter((f) => f.decision === "pendiente").length;
    const noSuben = todas.filter((f) => f.decision === "no_subir").length;
    if (vistaPrevia) avisos.push("Vista previa con lo que está marcado para subir. El informe definitivo sale del almacén cuando se pulsa «Subir al almacén».");
    if (sinDecidir > 0) avisos.push(`${sinDecidir} ${sinDecidir === 1 ? "máquina sin decidir no aparece" : "máquinas sin decidir no aparecen"} (falta código o revisar).`);
    if (noSuben > 0) avisos.push(`${noSuben} marcadas «No subir» no aparecen.`);
  } else if (consolidado) {
    // Un solo PDF: primero Open y luego Efameinsa, cada una en su sección con su logo (Santos 23-10).
    for (const e of ["OPEN", "EFAMEINSA"] as const) {
      const r = await delAlmacen(supabase, e);
      secciones.push({ ...logoDe(e), origen: `Stock de ${e} · ${r.origen}`, filas: r.filas.filter((f) => (doc === "lg" ? f.esLg : !f.esLg)), avisos: r.avisos });
    }
  } else {
    const r = await delAlmacen(supabase, empresa);
    filas = r.filas;
    origen = r.origen;
    avisos.push(...r.avisos);
  }

  const seleccion = filas.filter((f) => (doc === "lg" ? f.esLg : !f.esLg));
  const ahora = new Date();
  const generado = fechaHoraLima(ahora.toISOString());
  const fecha = ahora.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" });
  const buffer = await renderToBuffer(
    <StockGeneralPdf
      logoBuffer={logoDeEmpresa(empresa).buffer}
      logoAncho={logoDeEmpresa(empresa).ancho}
      doc={doc}
      filas={seleccion}
      fecha={fecha}
      generado={generado}
      origen={`Stock de ${empresa} · ${origen}`} vistaPrevia={vistaPrevia} avisos={avisos}
      secciones={consolidado ? secciones : undefined} />,
  );

  const fechaArchivo = ahora.toLocaleDateString("sv-SE", { timeZone: "America/Lima" });
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": cabeceraArchivo(`Resumen general de stock ${consolidado ? "consolidado Open y Efameinsa" : empresa} ${doc === "lg" ? "LG" : "industriales"} ${fechaArchivo}`, "pdf", true),
      "Cache-Control": "no-store",
    },
  });
}
