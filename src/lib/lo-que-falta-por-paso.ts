import { fechaLimaCorta } from "@/lib/fechas";
import { debeElPaso, type FilaTabla } from "@/lib/pedidos-por-paso";

/**
 * «LO QUE FALTA, PASO POR PASO» — los pedidos ABIERTOS repartidos por el paso
 * que deben, cada uno con una línea de detalle. Lo comparten la agenda de
 * postventa y la hoja del reporte diario en PDF (Santos, 13-10: «dice 81
 * abiertos… eso debe aparecer en su agenda y exportado en su PDF de su
 * reporte con detalle»). Una sola regla para los dos: lo que se ve en la
 * pantalla es lo que sale en el papel.
 */

export const PASOS_QUE_FALTAN: { clave: string; titulo: string; ayuda: string }[] = [
  { clave: "aprobado", titulo: "Falta aprobar el pedido", ayuda: "Postventa revisa el cierre y lo aprueba." },
  { clave: "pago", titulo: "Falta la confirmación de Finanzas", ayuda: "Finanzas confirma que el dinero está acreditado." },
  { clave: "pago_parcial", titulo: "Pago parcial: falta el saldo", ayuda: "Pagaron una parte; ubicar quién debe el saldo." },
  { clave: "prueba_sin_pedir", titulo: "Prueba y embalaje sin pedir al almacén", ayuda: "Nadie le pidió todavía al almacén que lo pruebe y embale." },
  { clave: "prueba", titulo: "Falta probar y embalar", ayuda: "Lo hace el almacén; incluye los repuestos por embalar." },
  { clave: "sin_stock", titulo: "Sin stock (sin serie o marcadas sin stock)", ayuda: "Por importar, en compra local, en fabricación o sin motivo marcado." },
  { clave: "plano", titulo: "Falta enviar el plano de preinstalación", ayuda: "Va en paralelo: cuanto antes, mejor." },
  { clave: "direccion", titulo: "Falta verificar la dirección y quién recibe", ayuda: "Se llama antes de despachar." },
  { clave: "apertura", titulo: "Falta emitir la apertura", ayuda: "Sin apertura no sale nada del almacén ni el técnico." },
  { clave: "preinstalacion", titulo: "Falta la preinstalación", ayuda: "Lima: videollamada antes del despacho. Provincia: el cliente confirma con fotos." },
  { clave: "despacho", titulo: "Falta despachar", ayuda: "Pendientes por despachar o por entregar en planta." },
  { clave: "verificado", titulo: "Falta verificar el despacho", ayuda: "Revisar las fotos y la guía que subió el almacén." },
  { clave: "puesta", titulo: "Falta la puesta en marcha o el servicio", ayuda: "Incluye mantenimientos, revisiones y repuestos con instalación." },
  { clave: "informe", titulo: "Falta enviar el informe técnico al cliente", ayuda: "Marcar el envío en el pedido, con su constancia." },
  { clave: "facturar", titulo: "Falta la orden a Finanzas para facturar y cobrar", ayuda: "Pedidos a crédito o con saldo: al terminar, se le pide a Finanzas que facture." },
  { clave: "listo_cerrar", titulo: "Listos para cerrar", ayuda: "Todo hecho: solo falta cerrar el pedido." },
];

export const FILTROS_SIN_PASO = new Set(["pago_parcial", "prueba_sin_pedir", "sin_stock", "listo_cerrar"]);

const MOTIVO_SIN_STOCK: Record<string, string> = {
  importacion: "por importar",
  compra_local: "compra local",
  fabricacion: "en fabricación",
  sin_motivo: "sin motivo marcado",
};

/** Tono de la línea de detalle: la pantalla lo pinta, el PDF lo colorea. */
export type TonoDetalle = "trabado" | "pendiente" | "espera" | "listo" | "stock";

export type FilaQueFalta = { f: FilaTabla; ahora: boolean; detalle: { texto: string; tono: TonoDetalle } | null };
export type SeccionQueFalta = (typeof PASOS_QUE_FALTAN)[number] & { filas: FilaQueFalta[]; ahoraN: number };

/** Una línea de qué pasa con ese paso en ese pedido: quién lo debe, desde cuándo o qué lo traba. */
export function detalleDelPaso(clave: string, f: FilaTabla): { texto: string; tono: TonoDetalle } | null {
  if (clave === "sin_stock") {
    const motivos = (f.sinStock ?? []).map((m) => MOTIVO_SIN_STOCK[m ?? "sin_motivo"] ?? m ?? "sin motivo marcado");
    return { texto: `${motivos.length} máquina${motivos.length === 1 ? "" : "s"} sin stock: ${[...new Set(motivos)].join(", ")}`, tono: "stock" };
  }
  if (clave === "pago_parcial") return { texto: f.pasos.find((x) => x.clave === "pago")?.etiqueta ?? "Pago parcial", tono: "pendiente" };
  if (clave === "listo_cerrar") return { texto: "Todos los pasos hechos: falta cerrarlo.", tono: "listo" };
  if (clave === "prueba_sin_pedir") return { texto: "Pídaselo al almacén desde el pedido.", tono: "trabado" };
  const paso = f.pasos.find((x) => x.clave === clave);
  if (!paso) return null;
  if (paso.trabado) return { texto: paso.trabado, tono: "trabado" };
  const siguiente = f.pasos.find((x) => !x.hecho);
  if (siguiente && siguiente.clave !== paso.clave) return { texto: `Antes falta: ${siguiente.etiqueta.toLowerCase()}`, tono: "espera" };
  return {
    texto: `${paso.etiqueta} · le toca a ${paso.dueno}${paso.cuando && clave === "despacho" ? ` · programado ${fechaLimaCorta(paso.cuando)}` : ""}`,
    tono: "pendiente",
  };
}

/**
 * Los pedidos abiertos por paso. Primero a quién le toca ahora (el primer paso
 * que le falta es este) o lo trabado; después lo que espera un paso anterior.
 */
export function loQueFaltaPorPaso(todas: FilaTabla[]): { abiertos: number; historia: number; secciones: SeccionQueFalta[] } {
  const abiertas = todas.filter((f) => !f.historia);
  const secciones = PASOS_QUE_FALTAN.map((p) => {
    const filas = abiertas
      .filter((f) => debeElPaso(f, p.clave))
      .map((f) => {
        const paso = f.pasos.find((x) => x.clave === p.clave);
        const siguiente = f.pasos.find((x) => !x.hecho);
        const ahora = FILTROS_SIN_PASO.has(p.clave) || siguiente?.clave === p.clave || Boolean(paso?.trabado);
        return { f, ahora, detalle: detalleDelPaso(p.clave, f) };
      });
    filas.sort((a, b) => Number(b.ahora) - Number(a.ahora) || a.f.cliente.localeCompare(b.f.cliente, "es"));
    return { ...p, filas, ahoraN: filas.filter((x) => x.ahora).length };
  }).filter((s) => s.filas.length > 0);
  return { abiertos: abiertas.length, historia: todas.length - abiertas.length, secciones };
}
