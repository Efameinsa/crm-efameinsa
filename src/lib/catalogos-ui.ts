// Fuente única de los textos de los campos codificados de la app —
// intención de compra, etapa de la oportunidad, motivo de rechazo — para
// que el criterio de cada opción se vea SIEMPRE en el desplegable, no
// escondido detrás de un hover (no funciona en tablet, ni con teclado, y
// el que más lo necesita —el usuario nuevo— no sabe que hay que pasar el
// puntero).
//
// Los textos de intención de compra y etapa vienen literales del manual
// oficial de Efameinsa EF-CRMAGE-COM-2020 (ver docs/08-taxonomia-oficial-
// efameinsa.md), adaptados a lenguaje de pantalla: solo el nombre legible,
// nunca el código del Excel (decisión de Darwin, 2026-08-18) — "Alto
// potencial", nunca "Alto_POTENCIAL".
//
// Si un valor no tiene un criterio confirmado en el manual, se deja "" en
// vez de inventar una definición propia.

export interface OpcionConCriterio {
  valor: string;
  etiqueta: string;
  criterio: string;
  /** Clase Tailwind del punto de color, cuando la lista es una ESCALA y no un
      conjunto de opciones sueltas. Ver COLOR_INTENCION. */
  color?: string;
}

// Escala de calor del interés de compra: de verde lleno (casi venta) a gris
// apagado (frío), pasando por ámbar. Se lee de un vistazo sin tener que
// leer la etiqueta, que es lo que hace falta al recorrer una lista larga.
//
// POR QUÉ VERDE Y NO EL GRANATE DE MARCA: el granate es el color de los
// enlaces y las acciones en toda la app, así que un punto granate se lee como
// "esto se puede clicar". El verde ya significa "bien" acá (venta, cotización
// aceptada), y "alto potencial" es justamente "casi venta".
//
// El color NUNCA va solo: siempre acompaña a la etiqueta escrita, para que
// funcione en blanco y negro y para quien no distingue verde de ámbar.
export const COLOR_INTENCION: Record<string, string> = {
  alto_potencial: "bg-[#1E7F4F]",
  medio_alto: "bg-[#1E7F4F]/55",
  medio: "bg-amber-500",
  medio_bajo: "bg-amber-500/50",
  bajo: "bg-muted-foreground/45",
  sin_definir: "border border-dashed border-muted-foreground/50 bg-transparent",
};

export const INTENCION_COMPRA: OpcionConCriterio[] = [
  { valor: "alto_potencial", etiqueta: "Alto potencial", criterio: "Espera la orden de compra o el depósito", color: COLOR_INTENCION.alto_potencial },
  { valor: "medio_alto", etiqueta: "Medio alto", criterio: "Ya tiene local, o dio una fecha exacta", color: COLOR_INTENCION.medio_alto },
  { valor: "medio", etiqueta: "Medio", criterio: "Está buscando ubicación", color: COLOR_INTENCION.medio },
  { valor: "medio_bajo", etiqueta: "Medio bajo", criterio: "Está buscando financiamiento", color: COLOR_INTENCION.medio_bajo },
  { valor: "bajo", etiqueta: "Bajo", criterio: "Solo quiere saber, sin intención concreta", color: COLOR_INTENCION.bajo },
  { valor: "sin_definir", etiqueta: "Sin definir", criterio: "Todavía no se ha calificado", color: COLOR_INTENCION.sin_definir },
];

export const ETAPA_OPORTUNIDAD: OpcionConCriterio[] = [
  { valor: "asignada", etiqueta: "Asignada", criterio: "Recibida, aún sin filtrar" },
  { valor: "filtrada", etiqueta: "Filtrada", criterio: "Filtro hecho en SUNAT y redes: ya se sabe con quién se habla" },
  { valor: "cotizada", etiqueta: "Cotizada", criterio: "Cotización enviada al cliente" },
  { valor: "seguimiento", etiqueta: "En seguimiento", criterio: "Se está insistiendo, sin respuesta final" },
  { valor: "potencial", etiqueta: "Potencial", criterio: "Pidió esperar para depositar, o está emitiendo la orden de compra" },
  { valor: "venta", etiqueta: "Venta", criterio: "Aceptó la cotización y se convirtió en cliente" },
  { valor: "rechazada", etiqueta: "Rechazada", criterio: "Se perdió el contacto o no procede" },
  { valor: "derivada", etiqueta: "Derivada", criterio: "Pasada a otro comercial u otra área" },
  { valor: "historico", etiqueta: "Histórico", criterio: "Vino del Excel y nadie la retomó en el CRM: se busca cuando se la necesita, pero no cuenta como pendiente" },
];

/**
 * LO QUE OFRECE EL DESPLEGABLE DE ETAPA DE LA OPORTUNIDAD.
 *
 * `cotizada` y `venta` no se pueden GUARDAR a mano —nacen del cotizador y del
 * botón «Registrar venta» (B3/B9)— porque marcar la etapa no crea la fila en
 * `ventas`, no acepta la cotización y no toca `ultima_venta_at`: el comercial
 * creería haber cerrado y su venta no contaría en ninguna cifra.
 *
 * Pero «Venta ejecutada» SÍ se ofrece, desde el 08-09. Santos: el comercial que
 * ganó la venta abre este desplegable, ve que las únicas salidas son
 * «Rechazada» y «Derivada», y no encuentra cómo decir que se ejecutó. Estaba
 * buscándola acá, así que acá tiene que estar — como cartel que lleva al
 * camino correcto, no como opción que se guarde.
 *
 * Lo que NO se hizo, a propósito: agregarla al catálogo de MOTIVOS DE RECHAZO,
 * que era la idea original. Todo lo rechazado entra en «lo que se perdió, y por
 * qué» del cierre semanal, con su gráfico por motivo: una venta ganada
 * aparecería como pérdida en el reporte que lee gerencia.
 */
export const ETAPAS_DEL_COMBO: OpcionConCriterio[] = [
  ...ETAPA_OPORTUNIDAD.filter((e) =>
    ["asignada", "filtrada", "seguimiento", "potencial", "rechazada"].includes(e.valor),
  ),
  {
    ...ETAPA_OPORTUNIDAD.find((e) => e.valor === "venta")!,
    etiqueta: "Venta ejecutada",
    criterio: "Se registra desde la cotización aceptada, para que cuente como venta",
  },
  /**
   * LAS DOS SALIDAS QUE FALTABAN, Y QUE SE ESCRIBÍAN A MANO.
   *
   * Brenda escribió «no tengo pendiente con este prospecto» como NOTA DE
   * GESTIÓN en dos oportunidades distintas (07 y 08-09), y en una tercera «la
   * venta ya fue cerrada, existe doble registro». No es descuido: el
   * desplegable no le daba ninguna forma de sacar algo de su lista que no
   * fuera llamarlo un rechazo, y rechazarlo habría metido una venta ganada y
   * un caso pasado a postventa dentro del reporte de «lo que se perdió, y por
   * qué» que lee gerencia.
   *
   * «Derivada» ya existía y decía «Pasada a otro comercial u otra área», pero
   * suena a algo que hace Central: se renombra por la frase que la comercial
   * usó al no encontrarla. Y se agrega archivar, que hasta hoy solo pasaba
   * por el import del Excel.
   *
   * Ninguna de las dos cuenta como pérdida. Y archivar es reversible: la
   * cartera muestra «Retomar» sobre las archivadas (0155).
   */
  {
    ...ETAPA_OPORTUNIDAD.find((e) => e.valor === "derivada")!,
    etiqueta: "Ya no es mío — pasó a otra área",
    criterio: "A postventa o a otro comercial. No cuenta como perdida.",
  },
  {
    ...ETAPA_OPORTUNIDAD.find((e) => e.valor === "historico")!,
    etiqueta: "Duplicado o ya no corresponde — archivar",
    criterio: "Sale de pendientes sin contarse como perdida. Se puede retomar desde la cartera.",
  },
];

export function buscarOpcion(catalogo: OpcionConCriterio[], valor: string | null | undefined): OpcionConCriterio | undefined {
  return catalogo.find((o) => o.valor === valor);
}
