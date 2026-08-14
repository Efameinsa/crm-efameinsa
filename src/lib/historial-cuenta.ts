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

  const [{ data: actividades }, { data: cotizaciones }, { data: ventas }] =
    opIds.length === 0
      ? [{ data: [] }, { data: [] }, { data: [] }]
      : await Promise.all([
          supabase
            .from("actividades")
            .select("id, tipo, nota, realizada_at, oportunidad_id, catalogo_resultados_gestion(codigo, nombre)")
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
              "id, fecha_venta, monto_total, moneda, oportunidad_id, cotizacion_id, cotizaciones(codigo, serie, cotizacion_items(cantidad, precio_unitario, productos(marca, modelo, nombre)))",
            )
            .in("oportunidad_id", opIds)
            .order("fecha_venta", { ascending: false }),
        ]);

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
      };
    }),
    ...(ventas ?? []).map(
      (v): EventoTimeline => ({
        tipo: "venta",
        id: v.id,
        fecha: v.fecha_venta,
        oportunidadId: v.oportunidad_id,
        monto: v.monto_total,
        moneda: v.moneda,
      }),
    ),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const ventasConDetalle = (ventas ?? []) as unknown as VentaConDetalle[];

  return { eventos, ventasConDetalle };
}
