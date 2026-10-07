import { armarCorreo, type EmpresaCorreo } from "@/lib/correo/plantilla";

/**
 * El correo de un AVISO del circuito (apertura emitida, corregida, guía
 * autorizada…): el mismo texto que sonó en la campana, con los datos del pedido
 * en una tabla y el botón para abrirlo en el CRM. Puro: lo usa el envío real y
 * las muestras que se mandan a revisar.
 */
export function armarAviso(d: {
  empresa: EmpresaCorreo;
  /** Para quién es, ya en texto: «Finanzas», «Almacén y Finanzas». */
  paraArea: string;
  titulo: string;
  cuerpo: string;
  /** Enlace absoluto al CRM. */
  enlace?: string;
  tabla?: { etiqueta: string; valor: string }[];
}): string {
  return armarCorreo({
    empresa: d.empresa,
    pretitulo: `Aviso para ${d.paraArea}`,
    titulo: d.titulo,
    parrafos: [d.cuerpo],
    tabla: d.tabla,
    boton: d.enlace ? { texto: "Abrir en el CRM", url: d.enlace } : undefined,
    preheader: d.cuerpo.length > 110 ? `${d.cuerpo.slice(0, 107)}…` : d.cuerpo,
    pie: "Este correo lo manda el CRM con el mismo aviso que sonó en la campana. A quién le llega se ajusta en el Directorio del CRM.",
  });
}
