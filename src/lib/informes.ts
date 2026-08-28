// Datos del informe de cierre que NO son acciones de servidor.
//
// Viven aparte de src/lib/acciones/informes.ts porque un módulo marcado con
// "use server" solo puede exportar funciones asíncronas: exportar de ahí una
// constante rompe la compilación ("Failed to collect page data").

// Los beneficios que el modelo real lista bajo "Incluye:". Van como texto
// editable y no como una constante impresa en el PDF porque el ing. Carlos
// pidió justamente poder cambiarlos por cotización ("bonos adicionales" /
// "beneficios generales"), sobre todo con empresa mediana-grande.
export const INCLUYE_POR_DEFECTO = [
  "36 meses de garantía",
  "Juego de manuales de operación, mantenimiento e instalación.",
  "Planos y asesoría para instalación (punto de agua, energía eléctrica, descarga y/o lo requerido para su operación).",
  "Asesoría y capacitación VIRTUAL con nuestros técnicos especializados para la conexión y puesta en marcha, las veces que sean necesarias.",
];

/**
 * Los avisos de "a quién se le está facturando" que la pantalla del cierre
 * pone delante del comercial.
 *
 * Es la otra mitad del «cierre más robusto» que pidió el ing. Carlos el 27-08
 * (migración 0087). La ficha RUC en papel la sacó de la lista de adjuntos —«ya
 * no sería necesaria»— y en su lugar pidió el control que sí importa: «que la
 * razón social del cierre sea la que se vendió, a veces son muy similares pero
 * tienen otro rumbo».
 *
 * No es hipotético: INVERSIONES NACIONALES DE TURISMO S.A. vive en tres fichas
 * casi idénticas —la matriz, "HOTEL PARACAS" y "LIBERTADOR HOTELS"— repartidas
 * en tres carteras. Facturar contra la equivocada es un documento que hay que
 * anular.
 *
 * Devuelve frases, no códigos: se leen tal cual en pantalla y en el confirm de
 * emisión. Lista vacía = la identidad del cierre calza con la de la ficha.
 */
export function avisosDeIdentidad(
  cierre: { nombre: string; doc: string | null },
  ficha: { razonSocial: string; numDoc: string | null },
): string[] {
  const normalizar = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  const doc = (cierre.doc ?? "").trim();
  const avisos: string[] = [];

  if (!doc) {
    avisos.push("El cierre va sin RUC ni DNI, y sin eso Central no puede emitir la factura.");
  } else if (!ficha.numDoc) {
    avisos.push("La ficha del cliente no tiene documento cargado, así que no hay contra qué contrastarlo.");
  } else if (normalizar(doc) !== normalizar(ficha.numDoc)) {
    avisos.push(`El documento del cierre (${doc}) no es el de la ficha (${ficha.numDoc}).`);
  }

  if (normalizar(cierre.nombre) !== normalizar(ficha.razonSocial)) {
    avisos.push(`La razón social del cierre no es la de la ficha: «${ficha.razonSocial}».`);
  }

  return avisos;
}
