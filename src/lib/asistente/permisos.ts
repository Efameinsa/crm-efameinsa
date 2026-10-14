import type { Perfil } from "@/types/database";

/**
 * QUIÉN PREGUNTA Y QUÉ PUEDE VER — la regla del asistente para todo el personal.
 *
 * El asistente NO decide permisos por su cuenta. Repite los de las pantallas:
 *
 *   1. Las consultas van con la sesión de quien pregunta (`createClient()`), así
 *      que las políticas de la base filtran las filas igual que en el CRM: el
 *      comercial ve su cartera, Central su bandeja, gerencia todo.
 *   2. Encima de eso se tapan las cifras para quien no debe verlas, ANTES de que
 *      los datos lleguen al modelo. Lo que el modelo no recibe, no lo puede
 *      contar, por más que se lo pidan con insistencia o con trampa.
 *
 * QUIÉN NO VE MONTOS. La regla de las pantallas es `puedeVerPrecios`
 * (lib/postventa.ts): «ni almacén ni postventa deberían tener acceso a los
 * precios… la forma de pago sí» (Carlos, 27-08). Postventa ve la historia del
 * cliente y las descripciones de las cotizaciones antiguas, sin cifras (Carlos,
 * 10-09; 0221). Acá se aplica más estricta que en `puedeVerPrecios`, que solo
 * mira `es_postventa`: el almacén queda protegido en sus pantallas porque cada
 * una tapa a mano, y un asistente no puede depender de eso. Importaciones
 * tampoco necesita cifras de venta para su trabajo.
 */

export type Quien = Pick<
  Perfil,
  | "id"
  | "nombre"
  | "rol"
  | "codigo_comercial"
  | "es_prueba"
  | "es_postventa"
  | "hace_postventa"
  | "solo_preventivo"
  | "es_soporte"
  | "es_operaciones"
  | "es_almacen"
  | "es_importaciones"
>;

export function esGerencia(q: Quien): boolean {
  return q.rol === "gerencia" || q.rol === "admin";
}

export function verMontos(q: Quien): boolean {
  if (esGerencia(q)) return true;
  if (q.es_postventa || q.es_almacen || q.es_importaciones) return false;
  return true;
}

/**
 * LOS PRECIOS DEL CATÁLOGO son otra cosa que los montos de las ventas.
 * Operaciones (Lesly) administra el catálogo y sus precios (Santos, 10-09),
 * aunque su cuenta tenga la marca de postventa y no vea cifras de ventas.
 */
export function verPreciosCatalogo(q: Quien): boolean {
  return verMontos(q) || q.rol === "operaciones" || Boolean(q.es_operaciones);
}

/** El comercial que vende (no postventa ni almacén con rol comercial). */
export function esComercialDeVenta(q: Quien): boolean {
  return q.rol === "comercial" && !q.es_postventa && !q.es_almacen && !q.es_importaciones;
}

/** En palabras: el área y lo que puede ver. Va al modelo y a la auditoría. */
export function alcanceDe(q: Quien): string {
  const area = esGerencia(q)
    ? q.rol === "admin"
      ? "administración"
      : "gerencia"
    : q.rol === "operaciones"
      ? "operaciones"
      : q.es_almacen
      ? "almacén"
      : q.es_importaciones
        ? "importaciones"
        : q.es_postventa
          ? q.solo_preventivo
            ? "postventa (venta de preventivos)"
            : "postventa"
          : q.rol === "comercial"
            ? `comercial${q.hace_postventa ? " que también hace postventa" : ""}`
            : q.rol === "facturacion"
              ? "facturación"
              : q.rol;
  const codigo = q.codigo_comercial ? ` ${q.codigo_comercial}` : "";
  return `${area}${codigo}${verMontos(q) ? "" : " · sin montos"}`;
}

/**
 * TAPAR CIFRAS. Se recorre lo que devuelve una consulta y se vacía todo campo
 * con nombre de importe, más los importes escritos dentro de un texto
 * («saldo US$ 1,200»). Es la segunda capa: cada herramienta ya pide sin
 * montos cuando puede; esto atrapa lo que se escape.
 */
const CLAVE_MONTO =
  /(monto|precio|importe|saldo|subtotal|^total$|total_|_total|usd|ticket|vendido|proyectado|pagado|tipo_cambio|meta_|igv)/i;
const CIFRA_EN_TEXTO = /(US\$|USD|S\/\.?|\$)\s?-?[\d][\d.,]*/g;

export function taparMontos<T>(valor: T): T {
  if (valor == null) return valor;
  if (typeof valor === "string") return valor.replace(CIFRA_EN_TEXTO, "(monto reservado)") as T;
  if (Array.isArray(valor)) return valor.map((v) => taparMontos(v)) as T;
  if (typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      salida[k] = CLAVE_MONTO.test(k) && v != null ? "(reservado)" : taparMontos(v);
    }
    return salida as T;
  }
  return valor;
}
