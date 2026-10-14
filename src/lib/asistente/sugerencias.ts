import { esGerencia, type Quien } from "@/lib/asistente/permisos";

/**
 * Las preguntas de ejemplo de la burbuja vacía, según el área. Enseñan qué se
 * le puede preguntar sin escribir un instructivo: a gerencia, las cifras; a
 * postventa y almacén, el estado de los pedidos; a todos, cómo funciona.
 */
export function sugerenciasPara(q: Quien): string[] {
  if (esGerencia(q)) {
    return [
      "¿Cuánto vendió Katerine esta semana?",
      "¿Qué perdimos la semana pasada y por qué?",
      "¿Por qué la cotización 562 está pendiente?",
      "¿En qué va el pedido de Sierra Travel?",
    ];
  }
  if (q.es_almacen || q.es_importaciones) {
    return [
      "¿Qué falta para despachar el pedido 420-26?",
      "¿Cuándo se puede marcar «probada y embalada»?",
      "¿Qué pasa con un pedido después de que almacén lo prueba?",
      "¿Hay stock de lavadoras de 30 kg?",
    ];
  }
  if (q.es_postventa) {
    return [
      "¿En qué va el pedido de Sierra Travel?",
      "¿Qué equipos le vendimos a Hotel Route 66?",
      "¿Cómo abro un caso de garantía?",
      "¿Por qué no puedo ver los precios?",
    ];
  }
  if (q.rol === "comercial") {
    return [
      "¿Cómo voy esta semana?",
      "¿Por qué mi cotización está pendiente de gerencia?",
      "¿Qué le falta a mi cierre para emitirlo?",
      "¿En qué va el pedido de mi cliente?",
    ];
  }
  if (q.rol === "finanzas" || q.rol === "facturacion") {
    return [
      "¿Qué pasa cuando doy el visto bueno a un crédito?",
      "¿En qué va el pedido 420-26?",
      "¿Cuándo se puede facturar un repuesto?",
      "¿Quién marcó el pago del pedido 420-26?",
    ];
  }
  if (q.rol === "central") {
    return [
      "¿De quién es el cliente Sierra Travel?",
      "¿Cómo corrijo una derivación?",
      "¿Qué pasa cuando marco los dos checks del cierre?",
      "¿Qué pasa con un pedido después del cierre?",
    ];
  }
  return [
    "¿Cómo funciona la aprobación de una cotización?",
    "¿Qué pasa con un pedido después del cierre?",
    "¿De quién es el cliente Sierra Travel?",
    "¿Qué lavadoras de 30 kg tenemos?",
  ];
}
