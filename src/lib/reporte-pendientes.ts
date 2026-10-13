import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaLima } from "@/lib/fechas";
import {
  avancePedido,
  bloquesPedido,
  estadoPago,
  etiquetaResponsable,
  pedidoSinCobro,
  queLoFrena,
  saldoPendiente,
  sinPrecios,
  type ServicioPostventa,
} from "@/lib/postventa";

/**
 * EL REPORTE DE LOS PENDIENTES (Lesly, 30-09: «tenemos que tener la opción
 * para generar el reporte de los pendientes; almacén tampoco tiene»).
 *
 * Los mismos pasos que el Control de pedidos, en un Excel para mandar o
 * imprimir. Tres hojas:
 *  - «Pedidos»: uno por fila, con la fase, qué lo frena y de quién depende.
 *  - «Pasos pendientes»: un paso por fila, para filtrar por responsable.
 *  - «Toca al almacén»: lo mismo, solo lo que tiene que mover el almacén
 *    (va primero cuando lo pide el almacén).
 * Sin precios: es un documento que circula.
 */
export interface FilaPedidoPendiente {
  pedido: string; cliente: string; ruc: string; equipo: string; fase: string; avance: string;
  frena: string; dependeDe: string; despacho: string; atrasado: boolean; apertura: string; salio: string; faltan: string;
}
export interface FilaPasoPendiente {
  pedido: string; cliente: string; equipo: string; fase: string; paso: string; responsable: string;
  porQue: string; despacho: string; delAlmacen: boolean;
}

/** Las filas del reporte, una sola vez: las usan el Excel y la hoja para imprimir / PDF (Lesly, 01-10). */
export function filasPendientes(pedidos: ServicioPostventa[], hoy: string): { pedidos: FilaPedidoPendiente[]; pasos: FilaPasoPendiente[] } {
  const dia = (iso: string | null | undefined) => (iso ? fechaLima(iso) : "");
  const cliente = (s: ServicioPostventa) => (s.cliente_texto ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");
  const ruc = (s: ServicioPostventa) => (s.cliente_texto ?? "").match(/^(\d{8,11})\s*-/)?.[1] ?? "";
  const equipo = (s: ServicioPostventa) => (s.equipo ?? "Sin equipo").replace(/\s+/g, " ").trim();
  const filasPedidos: FilaPedidoPendiente[] = [];
  const filasPasos: FilaPasoPendiente[] = [];

  for (const crudo of pedidos) {
    const s = sinPrecios(crudo);
    const bloques = bloquesPedido(s);
    const actual = bloques.find((b) => !b.completo) ?? bloques[bloques.length - 1];
    const avance = avancePedido(s);
    const frena = queLoFrena(s);
    const faltan = bloques.flatMap((b) => b.pasos.filter((p) => !p.hecho).map((p) => ({ b, p })));
    const atrasado = Boolean(s.fecha_despacho && !s.despachado_at && s.fecha_despacho < hoy);

    filasPedidos.push({
      pedido: s.numero_pedido_erp ?? "",
      cliente: cliente(s),
      ruc: ruc(s),
      equipo: equipo(s) + (s.informe_cierre_id ? "" : " (anterior al circuito)"),
      fase: `${actual.numero}. ${actual.titulo}`,
      avance: `${avance.hechos}/${avance.total}`,
      frena: frena?.texto ?? "",
      dependeDe: frena ? etiquetaResponsable(frena.responsable) : "",
      despacho: s.fecha_despacho ? fechaLima(s.fecha_despacho) : "",
      atrasado,
      apertura: dia(s.apertura_despacho_at),
      salio: dia(s.despachado_at),
      faltan: faltan.map(({ p }) => `${p.etiqueta} (${etiquetaResponsable(p.responsable)})`).join(" · "),
    });

    for (const { b, p } of faltan) {
      filasPasos.push({
        pedido: s.numero_pedido_erp ?? "",
        cliente: cliente(s),
        equipo: equipo(s),
        fase: `${b.numero}. ${b.titulo}`,
        paso: p.etiqueta,
        responsable: etiquetaResponsable(p.responsable),
        porQue: p.trabado ?? "",
        despacho: s.fecha_despacho ? fechaLima(s.fecha_despacho) : "",
        delAlmacen: p.responsable === "almacen",
      });
    }
  }
  return { pedidos: filasPedidos, pasos: filasPasos };
}

/**
 * LOS PEDIDOS CON PAGO PARCIAL (buzón, Ariana 13-10: «generar un informe con
 * el listado de dichos clientes, listo para enviar a Gerencia»). Los mismos
 * que deja el filtro «Pago parcial» de la tabla por paso: pagaron una parte
 * (confirmado o no por Finanzas) y deben el saldo; los que no llevan cobro
 * (garantía, 0441) no entran. Las cifras solo salen si quien lo arma puede
 * verlas (`conCifras`): el área de postventa no las ve (puedeVerPrecios).
 */
export interface FilaPagoParcial {
  pedido: string; cliente: string; ruc: string; equipo: string; formaPago: string; finanzas: string;
  despacho: string; frena: string; moneda: string; total: number | null; pagado: number | null; saldo: number | null;
}

export function esPagoParcial(s: ServicioPostventa): boolean {
  return estadoPago(s) === "parcial" && !pedidoSinCobro(s);
}

export function filasPagoParcial(pedidos: ServicioPostventa[], conCifras: boolean): FilaPagoParcial[] {
  const dia = (iso: string | null | undefined) => (iso ? fechaLima(iso) : "");
  return pedidos.filter(esPagoParcial).map((crudo) => {
    const s = sinPrecios(crudo);
    const frena = queLoFrena(s);
    const finanzas = crudo.pago_confirmado_at
      ? `Confirmó el abono el ${dia(crudo.pago_confirmado_at)}`
      : crudo.pago_observado_at
        ? `Observó el ${dia(crudo.pago_observado_at)}${crudo.pago_observado_motivo ? `: ${crudo.pago_observado_motivo}` : ""}`
        : crudo.pago_solicitado_at
          ? `Se le pidió el ${dia(crudo.pago_solicitado_at)}; aún no confirma`
          : "Aún no se le pidió confirmar";
    return {
      pedido: crudo.numero_pedido_erp ?? "",
      cliente: (crudo.cliente_texto ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, ""),
      ruc: (crudo.cliente_texto ?? "").match(/^(\d{8,11})\s*-/)?.[1] ?? "",
      equipo: (crudo.equipo ?? "Sin equipo").replace(/\s+/g, " ").trim(),
      formaPago: (crudo.forma_pago ?? "").trim(),
      finanzas,
      despacho: crudo.despachado_at
        ? `Salió el ${dia(crudo.despachado_at)}`
        : crudo.fecha_despacho
          ? `Programado ${fechaLima(crudo.fecha_despacho)}`
          : "Sin fecha",
      frena: frena ? `${frena.texto} (${etiquetaResponsable(frena.responsable)})` : "",
      moneda: crudo.moneda,
      total: conCifras && crudo.monto != null ? Number(crudo.monto) : null,
      pagado: conCifras && crudo.monto != null ? Number(crudo.monto_pagado ?? 0) : null,
      saldo: conCifras && crudo.monto != null ? saldoPendiente(crudo) : null,
    };
  });
}

export function libroPendientes(pedidos: ServicioPostventa[], hoy: string, deAlmacen: boolean): Buffer {
  const f = filasPendientes(pedidos, hoy);
  const hojaPedidos = f.pedidos.map((r) => ({
    Pedido: r.pedido,
    Cliente: r.cliente,
    RUC: r.ruc,
    Equipo: r.equipo,
    Fase: r.fase,
    Avance: r.avance,
    "Qué lo frena": r.frena,
    "Depende de": r.dependeDe,
    "Fecha de despacho": r.despacho + (r.atrasado ? " (atrasado)" : ""),
    "Apertura emitida": r.apertura,
    "Salió del almacén": r.salio,
    "Pasos que faltan": r.faltan,
  }));
  const paso = (r: FilaPasoPendiente) => ({
    Pedido: r.pedido,
    Cliente: r.cliente,
    Equipo: r.equipo,
    Fase: r.fase,
    "Paso pendiente": r.paso,
    Responsable: r.responsable,
    "Por qué no avanza": r.porQue,
    "Fecha de despacho": r.despacho,
  });

  const libro = XLSX.utils.book_new();
  const agregar = (nombre: string, filas: Record<string, string | number>[], anchos: number[]) => {
    const hoja = XLSX.utils.json_to_sheet(filas.length ? filas : [{ Aviso: "No hay pendientes." }]);
    hoja["!cols"] = anchos.map((wch) => ({ wch }));
    if (filas.length) hoja["!autofilter"] = { ref: hoja["!ref"] as string };
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  };
  const delAlmacen = f.pasos.filter((r) => r.delAlmacen).map(paso);
  const pasos = f.pasos.map(paso);
  const anchosPasos = [16, 40, 50, 22, 40, 14, 40, 14];

  if (deAlmacen) agregar("Toca al almacén", delAlmacen, anchosPasos);
  agregar("Pedidos", hojaPedidos, [16, 40, 13, 50, 22, 8, 45, 14, 20, 16, 16, 80]);
  agregar("Pasos pendientes", pasos, anchosPasos);
  if (!deAlmacen) agregar("Toca al almacén", delAlmacen, anchosPasos);

  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** La misma consulta que /postventa/control: lo vivo, venga o no del circuito, menos lo que Central todavía no lanzó. */
export async function cargarPedidosPendientes(supabase: SupabaseClient) {
  return supabase
    .from("servicios_postventa")
    .select("*")
    .eq("completado", false)
    .is("cerrado_at", null)
    .or("informe_cierre_id.is.null,pedido_ejecutado_at.not.is.null")
    .order("pedido_ejecutado_at", { ascending: false, nullsFirst: false })
    .order("fecha_confirmacion", { ascending: false, nullsFirst: false })
    .limit(1000);
}
