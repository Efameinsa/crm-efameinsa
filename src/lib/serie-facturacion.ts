// OPEN PRIMERO (decisión de gerencia del 23-09-2026).
//
// «La idea es que Open Investments sea la primera opción.» Los clientes nuevos
// se facturan con Open; a un antiguo que pide Efameinsa se le explica el
// cambio, y solo si insiste se factura con Efameinsa. Santos decidió no
// bloquear Efameinsa sino pedir el motivo por escrito (migración 0275).
//
// Vive aquí y no en `src/lib/acciones/`: un archivo «use server» solo exporta
// funciones async, y esto lo usan también las pantallas.

export type SerieFacturacion = "EFAMEINSA" | "OPEN";

/** Con qué serie arranca toda cotización o cierre nuevo. */
export const SERIE_POR_DEFECTO: SerieFacturacion = "OPEN";

/** Lo mínimo que se acepta como motivo: una frase, no «ok» ni «cliente». */
export const MOTIVO_SERIE_MINIMO = 10;

/** El recordatorio que acompaña al campo del motivo. */
export const AYUDA_SERIE_EFAMEINSA =
  "Open es la primera opción; Efameinsa solo si el cliente insiste después de explicarle.";

/** ¿El texto alcanza como motivo? */
export function motivoSerieSuficiente(motivo: string | null | undefined): boolean {
  return (motivo ?? "").trim().length >= MOTIVO_SERIE_MINIMO;
}

/**
 * El problema con la serie elegida, en castellano, o null si está bien.
 * OPEN no pide nada; EFAMEINSA pide una frase de motivo.
 */
export function problemaSerie(serie: SerieFacturacion, motivo: string | null | undefined): string | null {
  if (serie !== "EFAMEINSA") return null;
  if (motivoSerieSuficiente(motivo)) return null;
  return `Para facturar con Efameinsa escriba el motivo (una frase, mínimo ${MOTIVO_SERIE_MINIMO} caracteres). ${AYUDA_SERIE_EFAMEINSA}`;
}

/** Lo que se guarda en `motivo_serie`: el texto limpio en EFAMEINSA, nada en OPEN. */
export function motivoParaGuardar(serie: SerieFacturacion, motivo: string | null | undefined): string | null {
  if (serie !== "EFAMEINSA") return null;
  return (motivo ?? "").trim() || null;
}
