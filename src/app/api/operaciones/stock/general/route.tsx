import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));

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

export async function GET(request: Request) {
  const perfil = await requerirPerfil();
  const url = new URL(request.url);
  const doc = url.searchParams.get("doc") === "lg" ? "lg" : "industriales";
  const cargaId = url.searchParams.get("carga");
  const supabase = await createClient();

  let filas: FilaStockGeneral[] = [];
  let origen = "";
  let vistaPrevia = false;
  const avisos: string[] = [];

  if (cargaId) {
    if (!(["operaciones", "gerencia", "admin"].includes(perfil.rol) || perfil.es_operaciones)) {
      return NextResponse.json({ error: "La vista previa de una carga es de operaciones" }, { status: 403 });
    }
    const { data } = await supabase.from("stock_cargas").select("id, archivo, filas, estado").eq("id", cargaId).maybeSingle();
    if (!data) return NextResponse.json({ error: "No existe esa carga de stock" }, { status: 404 });
    const todas = (data.filas ?? []) as FilaCarga[];
    filas = todas.filter((f) => f.decision === "subir" && (f.codigoFinal ?? f.codigo)).map(deCarga);
    vistaPrevia = data.estado === "revisando";
    origen = `Carga: ${data.archivo}`;
    const sinDecidir = todas.filter((f) => f.decision === "pendiente").length;
    const noSuben = todas.filter((f) => f.decision === "no_subir").length;
    if (vistaPrevia) avisos.push("Vista previa con lo que está marcado para subir. El informe definitivo sale del almacén cuando se pulsa «Subir al almacén».");
    if (sinDecidir > 0) avisos.push(`${sinDecidir} ${sinDecidir === 1 ? "máquina sin decidir no aparece" : "máquinas sin decidir no aparecen"} (falta código o revisar).`);
    if (noSuben > 0) avisos.push(`${noSuben} marcadas «No subir» no aparecen.`);
  } else {
    // El almacén: una fila por máquina disponible, con lo que Importaciones dijo de ella (0584).
    const { data: inv } = await supabase
      .from("inventario_equipos")
      .select("serie, ubicacion, item_importaciones, descripcion, modelo, capacidad, proveedor, productos(sku, marca, modelo, nombre, segmento, dm:ficha->>descripcion_maestro)")
      .eq("estado", "disponible");
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
      .eq("estado", "subida")
      .eq("es_prueba", false)
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
  }

  const seleccion = filas.filter((f) => (doc === "lg" ? f.esLg : !f.esLg));
  const ahora = new Date();
  const generado = fechaHoraLima(ahora.toISOString());
  const fecha = ahora.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" });
  const buffer = await renderToBuffer(
    <StockGeneralPdf logoBuffer={LOGO_BUFFER} doc={doc} filas={seleccion} fecha={fecha} generado={generado} origen={origen} vistaPrevia={vistaPrevia} avisos={avisos} />,
  );

  const fechaArchivo = ahora.toLocaleDateString("sv-SE", { timeZone: "America/Lima" });
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": cabeceraArchivo(`Resumen general de stock ${doc === "lg" ? "LG" : "industriales"} ${fechaArchivo}`, "pdf", true),
      "Cache-Control": "no-store",
    },
  });
}
