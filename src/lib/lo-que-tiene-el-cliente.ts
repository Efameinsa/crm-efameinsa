import type { createClient } from "@/lib/supabase/server";
import { cargarHistorialCuenta } from "@/lib/historial-cuenta";

/**
 * LO QUE TIENE ESTE CLIENTE, A LA VISTA MIENTRAS POSTVENTA COTIZA.
 *
 * Santos, 26-09, cotizando desde postventa para HOTEL ROUTE 66: «en esa vista
 * de nueva cotización debería aparecer todo lo que se le vendió y cuándo
 * compró, todo lo que le facilite». Para cotizar un mantenimiento o un
 * repuesto hay que saber qué máquina tiene, desde cuándo, si sigue en
 * garantía y cuándo tocaba el preventivo; hasta hoy eso obligaba a salir del
 * cotizador a la ficha y volver.
 *
 * Sin montos: las compras vienen por `historial_cuenta_para_postventa` (0221),
 * la misma historia que ve postventa en la ficha. Equipos y pedidos van con
 * las políticas de siempre: lo que el área no puede ver, no aparece.
 */

export interface EquipoDelCliente {
  id: string;
  equipo: string;
  serie: string | null;
  comprado: string | null;
  garantiaHasta: string | null;
  ultimoMantenimiento: string | null;
  proximoMantenimiento: string | null;
  ubicacion: string | null;
}

export interface CompraDelCliente {
  fecha: string;
  /** Nº de cotización del CRM o del archivo del que salió la venta. */
  documento: string | null;
  empresa: string | null;
  lineas: string[];
}

export interface PedidoDelCliente {
  fecha: string | null;
  tipo: string;
  equipo: string | null;
  estado: string;
}

export interface CotizadoAlCliente {
  fecha: string | null;
  documento: string | null;
  empresa: string | null;
  /** Equipos del documento del archivo; las del CRM dicen en qué quedaron. */
  lineas: string[];
  estado: string | null;
}

export interface LoQueTieneElCliente {
  equipos: EquipoDelCliente[];
  compras: CompraDelCliente[];
  pedidos: PedidoDelCliente[];
  /** Lo último que se le cotizó (archivo y CRM), para no repetir o retomar. */
  cotizado: CotizadoAlCliente[];
}

const texto = (...partes: (string | null | undefined)[]) =>
  partes.map((p) => p?.trim()).filter(Boolean).join(" ");

export async function cargarLoQueTieneElCliente(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cuentaId: string,
): Promise<LoQueTieneElCliente> {
  const [{ data: equipos }, { data: pedidos }, historial, { data: paquete }] = await Promise.all([
    supabase
      .from("equipos_instalados")
      .select(
        "id, serie, modelo_texto, fecha_venta, fecha_puesta_marcha, garantia_hasta, ultimo_mantenimiento, proximo_mantenimiento, ubicacion, productos(marca, modelo, nombre)",
      )
      .eq("cuenta_id", cuentaId)
      .order("fecha_venta", { ascending: false, nullsFirst: false }),
    supabase
      .from("servicios_postventa")
      .select("tipo_servicio, tipo_pedido, equipo, fecha_despacho, despachado_at, completado, created_at")
      .eq("cuenta_id", cuentaId)
      .order("created_at", { ascending: false })
      .limit(8),
    cargarHistorialCuenta(supabase, cuentaId, { sinMontos: true }),
    // Las cotizaciones, con la misma función sin montos (0221).
    supabase.rpc("historial_cuenta_para_postventa", { p_cuenta: cuentaId }),
  ]);
  const cot = (paquete ?? {}) as {
    cotizaciones?: { codigo: string | null; estado: string | null; created_at: string | null }[] | null;
    cot_historicas?: { codigo: string | null; serie: string | null; fecha: string | null; items: string[] | null }[] | null;
  };
  const cotizado: CotizadoAlCliente[] = [
    ...(cot.cotizaciones ?? []).map((c) => ({
      fecha: c.created_at?.slice(0, 10) ?? null,
      documento: c.codigo,
      empresa: null,
      lineas: [],
      estado: c.estado,
    })),
    ...(cot.cot_historicas ?? []).map((h) => ({
      fecha: h.fecha?.slice(0, 10) ?? null,
      documento: h.codigo,
      empresa: h.serie,
      lineas: [...new Set(h.items ?? [])],
      estado: null,
    })),
  ]
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
    .slice(0, 5);

  return {
    equipos: (equipos ?? []).map((e) => {
      // El embed de a uno puede llegar como objeto o como arreglo.
      const crudo = e.productos as unknown as
        | { marca: string | null; modelo: string | null; nombre: string | null }
        | { marca: string | null; modelo: string | null; nombre: string | null }[]
        | null;
      const p = Array.isArray(crudo) ? (crudo[0] ?? null) : crudo;
      return {
        id: e.id as string,
        equipo: (p ? texto(p.marca, p.modelo) || texto(p.nombre) : "") || (e.modelo_texto as string | null) || "Equipo sin modelo",
        serie: (e.serie as string | null) ?? null,
        comprado: ((e.fecha_venta ?? e.fecha_puesta_marcha) as string | null) ?? null,
        garantiaHasta: (e.garantia_hasta as string | null) ?? null,
        ultimoMantenimiento: (e.ultimo_mantenimiento as string | null) ?? null,
        proximoMantenimiento: (e.proximo_mantenimiento as string | null) ?? null,
        ubicacion: (e.ubicacion as string | null) ?? null,
      };
    }),
    compras: historial.ventasConDetalle
      .filter((v) => !(v as { anulada_at?: string | null }).anulada_at)
      .map((v) => {
        const items = v.cotizaciones?.cotizacion_items ?? [];
        const lineas = items.length
          ? items.map((i) =>
              texto(i.cantidad > 1 ? `${i.cantidad} ×` : null, i.productos ? texto(i.productos.marca, i.productos.modelo) || i.productos.nombre : "Línea escrita a mano"),
            )
          : v.documentoArchivo?.items.length
            ? v.documentoArchivo.items
            : v.equipo_historico
              ? [v.equipo_historico]
              : [];
        return {
          fecha: v.fecha_venta,
          documento: v.cotizaciones?.codigo ?? v.referencia_historica ?? null,
          empresa: v.cotizaciones?.serie ?? null,
          lineas,
        };
      }),
    pedidos: (pedidos ?? []).map((s) => ({
      fecha: ((s.despachado_at ?? s.fecha_despacho ?? s.created_at) as string | null) ?? null,
      tipo: texto(s.tipo_servicio as string | null) || (s.tipo_pedido === "repuesto" ? "Repuesto" : s.tipo_pedido === "equipo" ? "Equipo" : "Pedido"),
      equipo: (s.equipo as string | null)?.split("\n")[0] ?? null,
      estado: s.completado ? "Cerrado" : s.despachado_at ? "Despachado" : "En curso",
    })),
    cotizado,
  };
}
