import type { createClient } from "@/lib/supabase/server";
import type { EventoTimeline } from "@/components/crm/linea-tiempo-cuenta";

// Se muestran las 300 actividades más recientes por cuenta — de sobra para el
// volumen real del piloto (~50 gestiones/día por comercial); si algún día se
// supera, la expansión del cliente (LineaTiempoCuenta) igual funciona sobre
// lo que llega, solo dejaría de ser "el historial completo".
const LIMITE_ACTIVIDADES = 300;

function etiquetaCotizacion(estado: string, estadoAprobacion: string): { label: string; color: "ambar" | "verde" | "rojo" } {
  if (estadoAprobacion === "pendiente_gerencia") return { label: "pendiente de aprobación", color: "ambar" };
  if (estadoAprobacion === "rechazada_gerencia") return { label: "rechazada", color: "rojo" };
  if (estado === "enviada") return { label: "enviada", color: "verde" };
  if (estado === "aceptada") return { label: "aceptada", color: "verde" };
  return { label: "creada", color: "verde" };
}

interface Item {
  cantidad: number;
  precio_unitario: number;
  productos: { marca: string; modelo: string; nombre: string } | null;
}

export interface VentaConDetalle {
  id: string;
  fecha_venta: string;
  monto_total: number;
  moneda: string;
  oportunidad_id: string;
  // Nro de presupuesto del Excel histórico ("1505-24") cuando la venta no
  // tiene cotización real en el sistema (migración 0027).
  referencia_historica: string | null;
  equipo_historico: string | null;
  cotizaciones: { codigo: string | null; serie: string; cotizacion_items: Item[] } | null;
}

export interface HistorialCuentaResultado {
  eventos: EventoTimeline[];
  ventasConDetalle: VentaConDetalle[];
}

// Fusiona actividades + cotizaciones + ventas de TODAS las oportunidades de
// una cuenta en una sola cronología — usado por la ficha del cliente
// (comercial y gerencia) y por el detalle de oportunidad, que ahora muestra
// la historia COMPLETA del cliente, no solo la de esa oportunidad.
export async function cargarHistorialCuenta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cuentaId: string,
): Promise<HistorialCuentaResultado> {
  const { data: oportunidades } = await supabase.from("oportunidades").select("id").eq("cuenta_id", cuentaId);
  const opIds = (oportunidades ?? []).map((o) => o.id);

  // Cotizaciones que la empresa emitió ANTES del CRM (tabla
  // cotizaciones_historicas, 2.644 documentos de las unidades S: y T:).
  // Cuelgan de la cuenta y no de una oportunidad, porque en su momento no
  // existían las oportunidades: por eso se consultan aparte y no por opIds.
  const { data: cotHistoricas } = await supabase
    .from("cotizaciones_historicas")
    .select("id, codigo, correlativo, anio, serie, fecha, monto_sin_igv, items, n_equipos, pdf_path")
    .eq("cuenta_id", cuentaId)
    .order("fecha", { ascending: false })
    .limit(100);

  const [{ data: actividades }, { data: cotizaciones }, { data: ventas }] =
    opIds.length === 0
      ? [{ data: [] }, { data: [] }, { data: [] }]
      : await Promise.all([
          supabase
            .from("actividades")
            .select("id, tipo, nota, realizada_at, oportunidad_id, adjuntos, catalogo_resultados_gestion(codigo, nombre)")
            .in("oportunidad_id", opIds)
            .order("realizada_at", { ascending: false })
            .limit(LIMITE_ACTIVIDADES),
          supabase
            .from("cotizaciones")
            .select("id, codigo, estado, estado_aprobacion, total, moneda, created_at, oportunidad_id")
            .in("oportunidad_id", opIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("ventas")
            .select(
              "id, fecha_venta, monto_total, moneda, oportunidad_id, cotizacion_id, referencia_historica, equipo_historico, cotizaciones(codigo, serie, cotizacion_items(cantidad, precio_unitario, productos(marca, modelo, nombre)))",
            )
            .in("oportunidad_id", opIds)
            .order("fecha_venta", { ascending: false }),
        ]);

  // URLs firmadas para los adjuntos (bucket privado): una sola llamada batch.
  type AdjuntoMeta = { path: string; nombre: string };
  const todasLasRutas = (actividades ?? []).flatMap((a) => ((a as { adjuntos?: AdjuntoMeta[] }).adjuntos ?? []).map((x) => x.path));
  const urlPorRuta = new Map<string, string>();
  if (todasLasRutas.length) {
    const { data: firmadas } = await supabase.storage.from("adjuntos").createSignedUrls(todasLasRutas, 3600);
    for (const f of firmadas ?? []) if (f.signedUrl && f.path) urlPorRuta.set(f.path, f.signedUrl);
  }

  // Nº de presupuesto → documento del archivo, para poder enlazar cada venta
  // histórica con la cotización de la que salió. Si el mismo Nº aparece dos
  // veces (el archivo tiene 223 duplicados por nombre de archivo distinto), se
  // queda el que tiene PDF: es el único que se puede abrir.
  const documentoPorCodigo = new Map<string, string>();
  for (const c of cotHistoricas ?? []) {
    if (!c.codigo || !c.pdf_path) continue;
    if (!documentoPorCodigo.has(c.codigo)) documentoPorCodigo.set(c.codigo, c.id);
  }

  const eventos: EventoTimeline[] = [
    ...(actividades ?? []).map((a): EventoTimeline => {
      const resultado = a.catalogo_resultados_gestion as unknown as { codigo: string; nombre: string } | null;
      return {
        tipo: "actividad",
        id: a.id,
        fecha: a.realizada_at,
        oportunidadId: a.oportunidad_id,
        tipoActividad: a.tipo,
        nota: a.nota,
        resultado,
        adjuntos: ((a as { adjuntos?: { path: string; nombre: string }[] }).adjuntos ?? [])
          .map((x) => ({ nombre: x.nombre, url: urlPorRuta.get(x.path) ?? "" }))
          .filter((x) => x.url),
      };
    }),
    ...(cotizaciones ?? []).map((c): EventoTimeline => {
      const { label, color } = etiquetaCotizacion(c.estado, c.estado_aprobacion);
      return {
        tipo: "cotizacion",
        id: c.id,
        fecha: c.created_at,
        oportunidadId: c.oportunidad_id,
        codigo: c.codigo,
        estadoLabel: label,
        color,
        monto: c.total,
        moneda: c.moneda,
        // A propósito SIN pdfUrl: la cotización del CRM vive en su oportunidad,
        // donde además de bajar el PDF se la envía, se la duplica y se registra
        // la venta. Repetir acá solo una de esas acciones haría creer que la
        // cronología es el lugar donde se opera, y escondería el resto. La fila
        // ya lleva el enlace a la oportunidad.
      };
    }),
    ...(cotHistoricas ?? []).map((c): EventoTimeline => ({
      tipo: "cotizacion",
      id: c.id,
      // `fecha` es columna date: se le pone mediodía para que ordenar por
      // instante no la corra al día anterior (lección de lib/fechas.ts).
      fecha: c.fecha ? `${c.fecha}T12:00:00` : new Date(0).toISOString(),
      oportunidadId: null,
      codigo: c.codigo ?? (c.correlativo ? `${c.correlativo}-${String(c.anio ?? "").slice(2)}` : null),
      estadoLabel: `${c.serie === "OPEN" ? "Open Investments" : "Efameinsa"} · del archivo`,
      color: "neutro",
      monto: c.monto_sin_igv,
      moneda: "USD",
      // El enlace es a una ruta del servidor, no al bucket: la URL firmada se
      // pide recién al hacer clic (vence en minutos) y así la política de
      // cartera decide en ese momento. Sin pdf_path el documento aún no está
      // subido o solo existe en .doc, y entonces no se ofrece nada.
      pdfUrl: c.pdf_path ? `/api/cotizaciones-historicas/${c.id}/pdf` : null,
    })),
    ...(ventas ?? []).map((v): EventoTimeline => {
      // "Venta cerrada — USD 9.618" a secas deja al comercial preguntándose de
      // qué cotización salió. Las ventas importadas del Excel traen el Nº de
      // presupuesto en `referencia_historica`, y ese documento suele estar en
      // el archivo de la misma cuenta: se enlaza para poder abrirlo.
      const documento = v.referencia_historica ? documentoPorCodigo.get(v.referencia_historica) : undefined;
      return {
        tipo: "venta",
        id: v.id,
        fecha: v.fecha_venta,
        oportunidadId: v.oportunidad_id,
        monto: v.monto_total,
        moneda: v.moneda,
        presupuesto: v.referencia_historica,
        pdfUrl: documento ? `/api/cotizaciones-historicas/${documento}/pdf` : null,
      };
    }),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const ventasConDetalle = (ventas ?? []) as unknown as VentaConDetalle[];

  return { eventos, ventasConDetalle };
}
