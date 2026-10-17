import type { FilaTabla } from "@/lib/pedidos-por-paso";
import { PASOS_QUE_FALTAN } from "@/lib/lo-que-falta-por-paso";
import type { PanoramaPendientes } from "@/lib/panorama-pendientes";
import type { ProblemasTecnicos } from "@/lib/problemas-tecnicos-reporte";
import type { RepuestosDelReporte } from "@/lib/repuestos-reporte";

/**
 * LA PRIMERA HOJA DEL REPORTE DE POSTVENTA (Santos, 16-10: «¿es la mejor forma
 * de ver las cosas?… con buenas prácticas»). Pirámide invertida: lo que
 * gerencia pregunta cada día va arriba —problemas técnicos, repuestos,
 * cotizaciones y pedidos— y debajo, lo urgente en orden. El detalle sigue en
 * las hojas de después. Funciones puras: la ruta ya juntó los datos.
 */

export type Tono = "accion" | "espera" | "cerrado";

export interface Urgente {
  tipo: string;
  cliente: string;
  que: string;
  dias: number | null;
}

/** Un pedido = una fila, con su siguiente paso (antes salía en cada paso que debía). */
export interface PedidoCompacto {
  cliente: string;
  equipo: string;
  paso: string;
  detalle: string | null;
  avisos: string[];
}

export interface GrupoPedidos {
  responsable: string;
  /** El grupo que le toca a postventa va primero y en granate. */
  esPostventa: boolean;
  pedidos: PedidoCompacto[];
}

/** Lo que FALTA, dicho como falta: «Despacho programado» o «Pedido cerrado» se leían como ya hechos. */
function queFalta(clave: string, etiqueta: string): string {
  if (clave === "cerrado") return "Falta cerrar el pedido";
  const t = PASOS_QUE_FALTAN.find((p) => p.clave === clave)?.titulo;
  return t ?? `Falta: ${etiqueta.charAt(0).toLowerCase()}${etiqueta.slice(1)}`;
}

const ORDEN_RESPONSABLE = ["Postventa", "Finanzas", "Almacén", "Central", "El cliente", "Técnico"];

export function pedidosPorResponsable(filas: FilaTabla[]): GrupoPedidos[] {
  const grupos = new Map<string, PedidoCompacto[]>();
  for (const f of filas.filter((x) => !x.historia)) {
    const siguiente = f.pasos.find((p) => !p.hecho);
    const responsable = siguiente?.dueno ?? "Postventa";
    const avisos = [
      ...(f.pagoParcial ? ["pago parcial"] : []),
      ...(f.sinStock?.length ? [`${f.sinStock.length} sin stock`] : []),
    ];
    grupos.set(responsable, [
      ...(grupos.get(responsable) ?? []),
      {
        cliente: f.cliente,
        equipo: f.equipo,
        paso: siguiente ? queFalta(siguiente.clave, siguiente.etiqueta) : "Todo hecho: falta cerrarlo",
        detalle: siguiente?.trabado ?? null,
        avisos,
      },
    ]);
  }
  const rango = (r: string) => {
    const i = ORDEN_RESPONSABLE.findIndex((x) => r.toLowerCase().startsWith(x.toLowerCase()));
    return i === -1 ? ORDEN_RESPONSABLE.length : i;
  };
  return [...grupos.entries()]
    .sort((a, b) => rango(a[0]) - rango(b[0]) || b[1].length - a[1].length)
    .map(([responsable, pedidos]) => ({ responsable, esPostventa: rango(responsable) === 0, pedidos }));
}

/** Lo urgente, en el orden en que conviene atenderlo: equipos parados, clientes sin respuesta, seguimientos vencidos. */
export function loUrgente(
  problemas: ProblemasTecnicos | undefined,
  repuestos: RepuestosDelReporte | undefined,
  panorama: PanoramaPendientes | undefined,
  pedidos: GrupoPedidos[],
  tope = 12,
): Urgente[] {
  const lista: Urgente[] = [
    ...(problemas?.filas ?? [])
      .filter((p) => p.urgente)
      .map((p) => ({ tipo: "Problema técnico", cliente: p.cliente, que: p.falta, dias: p.dias })),
    ...(repuestos?.abiertas ?? [])
      .filter((r) => r.estado.startsWith("Sin gestión"))
      .sort((a, b) => b.dias - a.dias)
      .map((r) => ({ tipo: "Repuesto sin gestión", cliente: r.cliente, que: "Responder y pedir stock al almacén", dias: r.dias })),
    ...(panorama?.seguimientos ?? [])
      .filter((s) => s.atraso > 0)
      .map((s) => ({ tipo: "Seguimiento vencido", cliente: s.cliente, que: s.accion ?? "Hacer seguimiento", dias: s.atraso })),
    ...(pedidos.find((g) => g.esPostventa)?.pedidos ?? []).map((p) => ({ tipo: "Pedido", cliente: p.cliente, que: p.paso, dias: null })),
  ];
  return lista.slice(0, tope);
}
