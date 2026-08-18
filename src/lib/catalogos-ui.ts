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
}

export const INTENCION_COMPRA: OpcionConCriterio[] = [
  { valor: "alto_potencial", etiqueta: "Alto potencial", criterio: "Espera la orden de compra o el depósito" },
  { valor: "medio_alto", etiqueta: "Medio alto", criterio: "Ya tiene local, o dio una fecha exacta" },
  { valor: "medio", etiqueta: "Medio", criterio: "Está buscando ubicación" },
  { valor: "medio_bajo", etiqueta: "Medio bajo", criterio: "Está buscando financiamiento" },
  { valor: "bajo", etiqueta: "Bajo", criterio: "Solo quiere saber, sin intención concreta" },
  { valor: "sin_definir", etiqueta: "Sin definir", criterio: "Todavía no se ha calificado" },
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
];

export function buscarOpcion(catalogo: OpcionConCriterio[], valor: string | null | undefined): OpcionConCriterio | undefined {
  return catalogo.find((o) => o.valor === valor);
}
