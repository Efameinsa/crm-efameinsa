/**
 * LOS PROCESOS DE LA EMPRESA EN DIAGRAMA (Santos, 16-10-2026): «para motivar a que todos
 * recuerden los procesos de negocio». Los 12 diagramas BPMN de postventa se dibujan con
 * Archify en mapa.efameinsa.com (fuente: ~/.local/bin/arquitectura/procesos-def.mjs) y el
 * CRM los muestra a quien tenga sesión, sin la contraseña del mapa: /procesos/p2 lee el
 * archivo publicado en la VM (/srv/mapa/proc-p2.html). Si cambia un título allá, cambiarlo acá.
 */
export type Proceso = { id: string; titulo: string; resumen: string; areas: string };

export const PROCESOS: Proceso[] = [
  { id: "p12", titulo: "Recorrido del pedido entre áreas", resumen: "La vista de pared: quién le pasa qué a quién, de la compra al equipo instalado.", areas: "Todas las áreas" },
  { id: "p1", titulo: "Del cierre de venta al pedido liberado", resumen: "Lo que hacen Central, almacén y Finanzas antes de que el pedido llegue a postventa.", areas: "Comercial · Central · Almacén · Finanzas" },
  { id: "p2", titulo: "Preparación del pedido y apertura de despacho", resumen: "Prueba en almacén, preinstalación con el cliente, pago parcial en ámbar y visto bueno.", areas: "Postventa · Almacén · Finanzas · Gerencia" },
  { id: "p3", titulo: "Guía, despacho y verificación", resumen: "Guía con su motivo, letras que viajan, despacho con fotos y el doble check.", areas: "Contabilidad · Almacén · Postventa · Finanzas" },
  { id: "p4", titulo: "Puesta en marcha y cierre del pedido", resumen: "Informe por máquina, orden de facturar y registro en equipos instalados.", areas: "Postventa · Finanzas · Contabilidad" },
  { id: "p5", titulo: "Pedido de repuesto o accesorio", resumen: "Sin prueba: recojo en planta, envío por agencia o entrega en el local.", areas: "Postventa · Almacén · Contabilidad" },
  { id: "p6", titulo: "Venta y ejecución de un servicio", resumen: "Cotización por gerencia, cierre de servicio, apertura, informe y factura.", areas: "Postventa · Gerencia · Central · Almacén · Finanzas" },
  { id: "p7", titulo: "Atención de un caso técnico", resumen: "Entrada por Central o directa, serie y garantía, diagnóstico y resultado.", areas: "Central · Postventa" },
  { id: "p8", titulo: "Apertura de llamada al almacén", resumen: "Revisión o videollamada del almacén para poder cotizar.", areas: "Postventa · Almacén" },
  { id: "p9", titulo: "Preventivos y ruta de mantenimiento", resumen: "De los 3 meses sin preventivo a la llamada y la venta del servicio.", areas: "Postventa" },
  { id: "p10", titulo: "Corrección y anulación de un cierre", resumen: "Código de Central, ventana de 30 minutos y avisos a las áreas.", areas: "Comercial · Central" },
  { id: "p11", titulo: "Excepciones de pago en el despacho", resumen: "Pago parcial, salida con código, crédito, letras y segundo anticipo.", areas: "Finanzas · Postventa · Gerencia · Almacén" },
];

/** La sugerencia de Efamein que abre la lista (va primera en todas las áreas). */
export const PREGUNTA_PROCESOS = "¿Quiere repasar los procesos de la empresa?";

/** La respuesta de Efamein a esa sugerencia: sale en el acto, sin consultar a la API. */
export function respuestaProcesos(): string {
  const [macro, ...resto] = PROCESOS;
  return [
    "¡Buena idea! Estos son los procesos de **postventa** dibujados paso a paso: quién hace cada cosa, qué pregunta decide el camino y qué frena el avance (en ámbar). Cada uno se abre en una pestaña nueva; use el botón **Pantalla completa** para verlo en grande.",
    "",
    `Para empezar, la vista de todo el pedido: [${macro.titulo}](/procesos/${macro.id}).`,
    "",
    ...resto.map((p) => `- [${p.id.toUpperCase()} · ${p.titulo}](/procesos/${p.id}): ${p.resumen}`),
    "",
    "También están todos juntos en [Procesos de la empresa](/procesos). ¿Le explico alguno?",
  ].join("\n");
}
