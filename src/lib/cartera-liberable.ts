import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * LA CARTERA LIBERABLE, PARA REPARTIRLA CADA TRES MESES.
 *
 * Gerencia, 23-09-2026: «Cartera: 3 meses sin venta para reasignar; se
 * redistribuye cada 3 meses». La vista `v_cuentas_liberables` (0276) dice
 * QUÉ clientes se pueden mover; quién se los queda lo sigue decidiendo
 * gerencia a mano. Esto es lo que comparten la pantalla y la acción en bloque:
 * el mismo filtro, para que «todas las filtradas» sean exactamente las que se
 * ven en la lista.
 */

/** Filas por página de la lista. */
export const LIBERABLES_POR_PAGINA = 50;

/**
 * Cuántos clientes se mueven como máximo de una vez. Cada uno es una llamada
 * a `reasignar_cartera` (mueve también sus oportunidades abiertas): 200 es
 * una tanda que termina en segundos y que un comercial puede absorber; con
 * miles, se hace en varias pasadas mirando cómo quedó cada una.
 */
export const TOPE_REASIGNACION_EN_BLOQUE = 200;

export interface FiltroLiberables {
  /** Dueño actual de la cartera. */
  comercialId?: string | null;
  /** Texto libre: razón social, nombre comercial o RUC/DNI. */
  q?: string;
  /** Solo los que compraron alguna vez (los demás son fichas del archivo que nunca compraron). */
  soloConVenta?: boolean;
}

export interface FilaLiberable {
  id: string;
  razon_social: string;
  num_doc: string | null;
  comercial_id: string;
  ultima_venta_at: string | null;
  cartera_desde: string | null;
  sin_venta_desde: string | null;
}

/**
 * El texto se mete dentro de un `.or()` de PostgREST: comas, paréntesis y
 * comodines lo romperían o lo harían buscar otra cosa.
 */
function textoSeguro(q: string): string {
  return q.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * La consulta filtrada sobre la vista, ya ordenada por más tiempo sin venta.
 * `columnas` y `count` los pone quien la usa (la lista pagina con conteo; la
 * acción en bloque solo quiere los ids).
 */
export function consultaLiberables(
  supabase: SupabaseClient,
  filtro: FiltroLiberables,
  columnas: string,
  opciones?: { count?: "exact" },
) {
  let consulta = supabase.from("v_cuentas_liberables").select(columnas, opciones);
  if (filtro.comercialId) consulta = consulta.eq("comercial_id", filtro.comercialId);
  if (filtro.soloConVenta) consulta = consulta.not("ultima_venta_at", "is", null);
  const t = textoSeguro(filtro.q ?? "");
  if (t.length >= 2) {
    const digitos = t.replace(/\D/g, "");
    const esDocumento = digitos.length >= 6 && digitos.length === t.replace(/[\s.-]/g, "").length;
    consulta = esDocumento
      ? consulta.ilike("num_doc", `${digitos}%`)
      : consulta.or(`razon_social.ilike.%${t}%,nombre_comercial.ilike.%${t}%`);
  }
  // Más tiempo sin venta primero; el id desempata para que la paginación no
  // repita ni salte filas con la misma fecha.
  return consulta.order("sin_venta_desde", { ascending: true, nullsFirst: true }).order("id");
}

const DIA_MS = 86_400_000;

/**
 * «Cuánto va sin venta», en palabras. Hay fichas del archivo con fecha
 * 01-01-1970 (el Excel no traía ninguna): no se dice «56 años», se dice lo
 * que es.
 */
export function tiempoSinVenta(desde: string | null, ahoraMs: number): string {
  if (!desde) return "Sin fecha";
  const dias = Math.floor((ahoraMs - new Date(desde).getTime()) / DIA_MS);
  if (dias < 0) return "—";
  if (dias < 60) return `${dias} días`;
  const meses = Math.floor(dias / 30.44);
  if (meses < 24) return `${meses} meses`;
  const anios = Math.floor(meses / 12);
  if (anios > 10) return "Más de 10 años";
  return `${anios} años`;
}

/** La hora de ahora, fuera del cuerpo del componente (regla react-hooks/purity). */
export function ahoraMs(): number {
  return Date.now();
}
