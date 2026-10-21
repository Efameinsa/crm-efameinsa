// LA SERIE SALE SOLA SEGÚN LO QUE SE VENDE (gerencia, 21-10-2026).
//
// «Todo producto debe despacharse con Efameinsa (por defecto) y todo repuesto,
// servicio, etc. con Open Investments (por defecto); quitar el dar
// explicaciones.» Reemplaza a «Open primero» del 23-09, que pedía por escrito
// el motivo de cada Efameinsa (migración 0275): ya no se pide. La serie se
// puede seguir cambiando a mano, sin preguntas.
//
// Vive aquí y no en `src/lib/acciones/`: un archivo «use server» solo exporta
// funciones async, y esto lo usan también las pantallas.

export type SerieFacturacion = "EFAMEINSA" | "OPEN";

/** Con qué serie arranca una cotización vacía de postventa (repuestos y servicios). */
export const SERIE_POR_DEFECTO: SerieFacturacion = "OPEN";

/** Lo que NO es un equipo: va con Open. Todo lo demás del catálogo es producto. */
const CATEGORIAS_OPEN = new Set(["repuesto", "servicio"]);

/** ¿Esta categoría del catálogo es un equipo (lavadora, secadora, planchador, coche…)? */
export function esCategoriaDeEquipo(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return !CATEGORIAS_OPEN.has(categoria.trim().toLowerCase());
}

/**
 * La serie que corresponde por defecto: EFAMEINSA si hay al menos un equipo,
 * OPEN si todo es repuesto o servicio. Sin nada reconocible (vacío o solo
 * líneas a mano) decide `sinDatos`: comercial vende equipos, postventa no.
 */
export function seriePorDefecto(categorias: (string | null | undefined)[], sinDatos: SerieFacturacion): SerieFacturacion {
  const conocidas = categorias.filter((c): c is string => Boolean(c && c.trim()));
  if (conocidas.length === 0) return sinDatos;
  return conocidas.some(esCategoriaDeEquipo) ? "EFAMEINSA" : "OPEN";
}

/** Ya no se pide motivo para ninguna serie (21-10): siempre null. Se conserva la firma para las acciones. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function problemaSerie(_serie: SerieFacturacion, _motivo: string | null | undefined): string | null {
  return null;
}

/** El motivo ya no se pide; si alguien lo escribió antes en EFAMEINSA, se conserva. */
export function motivoParaGuardar(serie: SerieFacturacion, motivo: string | null | undefined): string | null {
  if (serie !== "EFAMEINSA") return null;
  return (motivo ?? "").trim() || null;
}

/** Para el tablero de gerencia, que contaba los Efameinsa con motivo. */
export function motivoSerieSuficiente(motivo: string | null | undefined): boolean {
  return (motivo ?? "").trim().length >= 10;
}
