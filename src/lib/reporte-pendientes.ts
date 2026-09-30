import * as XLSX from "xlsx";
import { fechaLima } from "@/lib/fechas";
import { avancePedido, bloquesPedido, etiquetaResponsable, queLoFrena, sinPrecios, type ServicioPostventa } from "@/lib/postventa";

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
export function libroPendientes(pedidos: ServicioPostventa[], hoy: string, deAlmacen: boolean): Buffer {
  const dia = (iso: string | null | undefined) => (iso ? fechaLima(iso) : "");
  const cliente = (s: ServicioPostventa) => (s.cliente_texto ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");
  const ruc = (s: ServicioPostventa) => (s.cliente_texto ?? "").match(/^(\d{8,11})\s*-/)?.[1] ?? "";
  const equipo = (s: ServicioPostventa) => (s.equipo ?? "Sin equipo").replace(/\s+/g, " ").trim();

  const hojaPedidos: Record<string, string | number>[] = [];
  const hojaPasos: Record<string, string | number>[] = [];

  for (const crudo of pedidos) {
    const s = sinPrecios(crudo);
    const bloques = bloquesPedido(s);
    const actual = bloques.find((b) => !b.completo) ?? bloques[bloques.length - 1];
    const avance = avancePedido(s);
    const frena = queLoFrena(s);
    const faltan = bloques.flatMap((b) => b.pasos.filter((p) => !p.hecho).map((p) => ({ b, p })));
    const atrasado = Boolean(s.fecha_despacho && !s.despachado_at && s.fecha_despacho < hoy);

    hojaPedidos.push({
      Pedido: s.numero_pedido_erp ?? "",
      Cliente: cliente(s),
      RUC: ruc(s),
      Equipo: equipo(s) + (s.informe_cierre_id ? "" : " (anterior al circuito)"),
      Fase: `${actual.numero}. ${actual.titulo}`,
      Avance: `${avance.hechos}/${avance.total}`,
      "Qué lo frena": frena?.texto ?? "",
      "Depende de": frena ? etiquetaResponsable(frena.responsable) : "",
      "Fecha de despacho": s.fecha_despacho ? fechaLima(s.fecha_despacho) + (atrasado ? " (atrasado)" : "") : "",
      "Apertura emitida": dia(s.apertura_despacho_at),
      "Salió del almacén": dia(s.despachado_at),
      "Pasos que faltan": faltan.map(({ p }) => `${p.etiqueta} (${etiquetaResponsable(p.responsable)})`).join(" · "),
    });

    for (const { b, p } of faltan) {
      hojaPasos.push({
        Pedido: s.numero_pedido_erp ?? "",
        Cliente: cliente(s),
        Equipo: equipo(s),
        Fase: `${b.numero}. ${b.titulo}`,
        "Paso pendiente": p.etiqueta,
        Responsable: etiquetaResponsable(p.responsable),
        "Por qué no avanza": p.trabado ?? "",
        "Fecha de despacho": s.fecha_despacho ? fechaLima(s.fecha_despacho) : "",
        _almacen: p.responsable === "almacen" ? 1 : 0,
      });
    }
  }

  const libro = XLSX.utils.book_new();
  const agregar = (nombre: string, filas: Record<string, string | number>[], anchos: number[]) => {
    const hoja = XLSX.utils.json_to_sheet(filas.length ? filas : [{ Aviso: "No hay pendientes." }]);
    hoja["!cols"] = anchos.map((wch) => ({ wch }));
    if (filas.length) hoja["!autofilter"] = { ref: hoja["!ref"] as string };
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  };
  const sinMarca = (f: Record<string, string | number>) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== "_almacen"));
  const delAlmacen = hojaPasos.filter((f) => f._almacen === 1).map(sinMarca);
  const pasos = hojaPasos.map(sinMarca);
  const anchosPasos = [16, 40, 50, 22, 40, 14, 40, 14];

  if (deAlmacen) agregar("Toca al almacén", delAlmacen, anchosPasos);
  agregar("Pedidos", hojaPedidos, [16, 40, 13, 50, 22, 8, 45, 14, 20, 16, 16, 80]);
  agregar("Pasos pendientes", pasos, anchosPasos);
  if (!deAlmacen) agregar("Toca al almacén", delAlmacen, anchosPasos);

  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
