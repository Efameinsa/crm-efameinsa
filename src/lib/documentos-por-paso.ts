/**
 * CADA INFORME EN SU PASO (Santos, 02-10, mirando el pedido de Julca).
 *
 * «Los de postventa deben ver todos los informes… deben figurar como link de
 * PDF en cada etapa»: el riel vertical marcaba todo en verde, pero para abrir
 * el protocolo, la apertura o el informe de la videollamada había que ir a
 * buscarlo a la columna derecha. Ahora cada paso lleva, debajo, los papeles
 * que lo prueban — los del almacén y los de quien corresponda — y un clic los
 * abre. «Informes del pedido» sigue a la derecha con todos juntos.
 *
 * Acá solo se REPARTE: la página ya tiene los datos (firmados) y los pasa.
 */

export type DocPaso = {
  texto: string;
  href: string;
  /** pdf: se abre en el visor del CRM · pagina: otra pantalla del CRM · archivo: el archivo subido, en pestaña nueva. */
  tipo: "pdf" | "pagina" | "archivo";
  /** Los informes de servicio se corrigen con código (0383): el lápiz al lado lleva al cuadro abierto. */
  corregir?: string;
};

export type DocumentosPorPaso = Record<string, DocPaso[]>;

type Foto = { etiqueta: string; nombre: string; url: string | null };
type Adjunto = { tipo?: string; nombre: string; url: string | null };
type Apertura = {
  id: string;
  tipo: string;
  anulada: boolean;
  revisada: boolean;
  conHojaCliente: boolean;
  informeId: string | null;
  informeNumero: string | null;
};
type InformeServicio = { id: string; tipo: string; numero: string | null };

const MOTIVO: Record<string, string> = {
  videollamada_preinstalacion: "preinstalación",
  videollamada_puesta_marcha: "puesta en marcha",
  soporte_videollamada: "soporte",
  atencion_in_situ: "atención en el local",
  revision: "revisión",
};

/** A qué paso del riel pertenece cada llamada derivada. */
function pasoDeApertura(tipo: string): string {
  return tipo === "videollamada_preinstalacion" ? "preinstalacion" : "puesta";
}

export function documentosPorPaso(d: {
  servicioId: string;
  cierre: { id: string; codigo: string | null } | null;
  cotizacion: { id: string; codigo: string } | null;
  adjuntos: Adjunto[];
  capturaFinanzas: string | null;
  protocolo: boolean;
  aperturaDespacho: boolean;
  fotos: Foto[];
  aperturas: Apertura[];
  informes: InformeServicio[];
}): DocumentosPorPaso {
  const docs: DocumentosPorPaso = {};
  const poner = (paso: string, doc: DocPaso | null) => {
    if (!doc) return;
    (docs[paso] ??= []).push(doc);
  };
  const archivo = (texto: string, url: string | null): DocPaso | null => (url ? { texto, href: url, tipo: "archivo" } : null);

  // ① El pago: lo que Finanzas usó para confirmarlo y los vouchers del cierre.
  poner("pago", archivo("Captura de Finanzas", d.capturaFinanzas));
  d.adjuntos.filter((a) => a.tipo === "voucher").forEach((a, i, l) => poner("pago", archivo(l.length > 1 ? `Voucher ${i + 1}` : "Voucher", a.url)));

  // El pedido aprobado nace del cierre: el informe, su cotización y la OC.
  if (d.cierre) poner("aprobado", { texto: d.cierre.codigo ? `Cierre N.º ${d.cierre.codigo}` : "Informe de cierre", href: `/api/informes/${d.cierre.id}/pdf`, tipo: "pdf" });
  if (d.cotizacion) poner("aprobado", { texto: `Cotización ${d.cotizacion.codigo}`, href: `/api/cotizaciones/${d.cotizacion.id}/pdf`, tipo: "pdf" });
  d.adjuntos.filter((a) => a.tipo === "cotizacion").forEach((a) => poner("aprobado", archivo(`Cotización ${a.nombre.match(/Presu_[\w-]+/i)?.[0] ?? "adjunta"}`, a.url)));
  d.adjuntos.filter((a) => a.tipo === "orden_compra").forEach((a) => poner("aprobado", archivo("Orden de compra", a.url)));

  // La prueba y el embalaje: el protocolo del almacén (con sus fotos adentro).
  if (d.protocolo) poner("prueba", { texto: "Protocolo de prueba y embalaje", href: `/pedidos/${d.servicioId}/protocolo`, tipo: "pagina" });

  // ② La apertura de despacho.
  if (d.aperturaDespacho) poner("apertura", { texto: "Apertura de servicio", href: `/postventa/pedidos/${d.servicioId}/apertura`, tipo: "pagina" });

  // El despacho: la guía de remisión y las fotos de la salida; la entrega: la foto de la máquina instalada.
  d.fotos.filter((f) => f.etiqueta === "guia").forEach((f, i, l) => poner("despacho", archivo(l.length > 1 ? `Guía de remisión ${i + 1}` : "Guía de remisión", f.url)));
  const salida = d.fotos.filter((f) => !["guia", "maquina", "protocolo"].includes(f.etiqueta) && f.url).length;
  if (salida) poner("despacho", { texto: `Fotos de la salida (${salida})`, href: "#fotos-almacen", tipo: "pagina" });
  d.fotos.filter((f) => f.etiqueta === "maquina").forEach((f) => poner("verificado", archivo("Máquina entregada", f.url)));

  // Las llamadas derivadas: la de preinstalación en su paso, las demás en la puesta en marcha.
  const informesDeLlamada = new Set<string>();
  for (const a of d.aperturas) {
    if (a.anulada) continue;
    const paso = pasoDeApertura(a.tipo);
    if (a.informeId) {
      informesDeLlamada.add(a.informeId);
      poner(paso, {
        texto: a.informeNumero ? `Informe N.º ${a.informeNumero}` : `Informe de ${MOTIVO[a.tipo] ?? "la llamada"}`,
        href: `/postventa/informes/${a.informeId}/imprimir`,
        tipo: "pagina",
        corregir: `/postventa/informes/${a.informeId}?corregir=1`,
      });
    }
    if (a.conHojaCliente && a.revisada) poner(paso, { texto: "Hoja para el cliente", href: `/aperturas/${a.id}/imprimir`, tipo: "pagina" });
    if (!a.informeId) poner(paso, { texto: `Llamada de ${MOTIVO[a.tipo] ?? "soporte"} (sin informe aún)`, href: `/aperturas/${a.id}`, tipo: "pagina" });
  }

  // Los informes técnicos que no salieron de una llamada: la puesta en marcha en el local.
  for (const i of d.informes) {
    if (informesDeLlamada.has(i.id) || i.tipo !== "puesta_en_marcha") continue;
    poner("puesta", {
      texto: i.numero ? `Informe N.º ${i.numero}` : "Informe de puesta en marcha (borrador)",
      href: `/postventa/informes/${i.id}/imprimir`,
      tipo: "pagina",
      corregir: `/postventa/informes/${i.id}?corregir=1`,
    });
  }

  return docs;
}
