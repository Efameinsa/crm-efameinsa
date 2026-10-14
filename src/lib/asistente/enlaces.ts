import { esGerencia, verMontos, type Quien } from "@/lib/asistente/permisos";

/**
 * LOS ENLACES QUE EL ASISTENTE PUEDE DAR (14-10), por área.
 *
 * El buscador universal enlaza a pantallas de gerencia, y a otra persona eso la
 * deja en una pantalla que no puede abrir. Acá cada enlace sale de la regla de
 * quién entra a cada pantalla (layouts y guardas, revisados el 14-10):
 *
 *   · /nuevo/pedido/[id]   postventa, soporte, almacén, gerencia, admin
 *   · /almacen/pedidos/[id] almacén, operaciones, soporte, gerencia, admin —
 *                           la ÚNICA con «Probada y embalada»
 *   · /finanzas/pedidos/[id] finanzas, gerencia, admin, operaciones
 *   · /pedidos/[id]/imprimir Central (no entra a las fichas de pedido)
 *   · /nuevo/cliente/[id]   comercial (incluye postventa), gerencia, admin, operaciones
 *   · /central/clientes/[id] Central, en lectura
 *
 * Si a esta persona no le corresponde ninguna pantalla, no hay enlace: el
 * asistente no inventa rutas (las instrucciones se lo prohíben).
 */

type Enlace = { texto: string; ruta: string };

const esAlmacen = (q: Quien) => Boolean(q.es_almacen || q.es_operaciones || q.es_soporte);
const esPostventa = (q: Quien) => Boolean(q.es_postventa || q.es_soporte);
const esFinanzas = (q: Quien) => q.rol === "finanzas" || Boolean(q.es_operaciones);

export function enlacesDelPedido(q: Quien, pedidoId: string, cuentaId: string | null): Enlace[] {
  const e: Enlace[] = [];
  if (esAlmacen(q) || esGerencia(q)) e.push({ texto: "Pedido en Almacén (prueba, protocolo y despacho)", ruta: `/almacen/pedidos/${pedidoId}` });
  if (esPostventa(q) || q.es_almacen || esGerencia(q)) e.push({ texto: "Ficha del pedido", ruta: `/nuevo/pedido/${pedidoId}` });
  if (esFinanzas(q) || esGerencia(q)) e.push({ texto: "Pedido en Finanzas (visto bueno y abonos)", ruta: `/finanzas/pedidos/${pedidoId}` });
  if (q.rol === "central") e.push({ texto: "Hoja del pedido", ruta: `/pedidos/${pedidoId}/imprimir` });
  e.push({ texto: "Informe de prueba y embalaje", ruta: `/pedidos/${pedidoId}/protocolo` });
  if (cuentaId && e.length <= 1) {
    const c = enlaceDelCliente(q, cuentaId, "pedidos");
    if (c) e.push(c);
  }
  return e;
}

export function enlaceDelCliente(q: Quien, cuentaId: string, pestana?: string): Enlace | null {
  if (q.rol === "comercial" || q.rol === "operaciones" || esGerencia(q)) {
    return { texto: "Ficha del cliente", ruta: `/nuevo/cliente/${cuentaId}${pestana ? `?tab=${pestana}` : ""}` };
  }
  if (q.rol === "central") return { texto: "Ficha del cliente (lectura)", ruta: `/central/clientes/${cuentaId}` };
  if (q.es_almacen) return { texto: "Informes del cliente", ruta: `/almacen/informes/clientes/${cuentaId}` };
  return null;
}

export function enlacesDeCotizacion(q: Quien, cotizacionId: string, oportunidadId: string | null): Enlace[] {
  const e: Enlace[] = [];
  if (oportunidadId && (q.rol === "comercial" || q.rol === "operaciones" || esGerencia(q))) {
    e.push({ texto: "Abrir la cotización", ruta: `/comercial/oportunidades/${oportunidadId}/cotizar/${cotizacionId}` });
  }
  // El PDF tapa las cifras solo para quien no las ve.
  e.push({ texto: verMontos(q) ? "PDF de la cotización" : "PDF de la cotización (sin montos)", ruta: `/api/cotizaciones/${cotizacionId}/pdf` });
  return e;
}
