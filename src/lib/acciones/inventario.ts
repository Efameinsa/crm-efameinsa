"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// El stock del almacén (migración 0117). Las reglas —quién puede, qué serie se
// acepta, a qué estado puede pasar cada máquina— viven en la base.

export interface ResultadoCarga {
  error: string | null;
  cargadas?: number;
  repetidas?: string[];
  invalidas?: string[];
}

/**
 * Carga varias máquinas de una vez, pegando la lista de series.
 *
 * Así es como llega el stock: en una columna de Excel. Un formulario por
 * máquina, con cuarenta máquinas, es la forma segura de que el inventario no se
 * cargue nunca.
 */
export async function cargarSeries(
  productoId: string,
  seriesTexto: string,
  ubicacion: string | null,
): Promise<ResultadoCarga> {
  const series = seriesTexto
    .split(/[\n,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (series.length === 0) return { error: "Pegue al menos un número de serie" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cargar_series_inventario", {
    p_producto: productoId,
    p_series: series,
    p_ubicacion: ubicacion,
    p_nota: null,
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  const r = (data ?? {}) as { cargadas?: number; repetidas?: string[]; invalidas?: string[] };
  revalidatePath("/operaciones/inventario");
  revalidatePath("/operaciones/catalogo");
  return { error: null, cargadas: r.cargadas ?? 0, repetidas: r.repetidas ?? [], invalidas: r.invalidas ?? [] };
}

export async function moverEquipo(
  id: string,
  estado: "disponible" | "reservado" | "despachado" | "baja",
  cuentaId: string | null,
): Promise<{ error: string | null; serie?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mover_equipo_inventario", {
    p_id: id,
    p_estado: estado,
    p_cuenta: cuentaId,
    p_nota: null,
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
  revalidatePath("/operaciones/inventario");
  revalidatePath("/operaciones/catalogo");
  return { error: null, serie: (data as { serie?: string })?.serie };
}
