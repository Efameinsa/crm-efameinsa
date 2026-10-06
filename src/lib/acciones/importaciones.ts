"use server";

// IMPORTACIONES (0402, 06-10): lo que falta importar para los pedidos y la
// fecha en que llega. Todo pasa por funciones de la base que validan quién
// puede (importaciones, almacén, operaciones, gerencia).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface PendienteImportacion {
  item_id: string;
  pedido_id: string;
  cliente: string;
  descripcion: string;
  sku: string | null;
  motivo: "importacion" | "compra_local" | "fabricacion" | null;
  marcado_at: string | null;
  eta: string | null;
  nota: string | null;
  actualizada_at: string | null;
  pedido_desde: string | null;
  tipo_pedido: string | null;
}

export async function pendientesDeImportacion(): Promise<{ filas: PendienteImportacion[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("importaciones_pendientes");
  if (error) return { filas: [], error: error.message };
  return { filas: (data ?? []) as PendienteImportacion[], error: null };
}

export async function anotarImportacion(datos: { itemId: string; eta: string | null; nota: string }): Promise<{ error: string | null; n?: number }> {
  if (datos.eta && !/^\d{4}-\d{2}-\d{2}$/.test(datos.eta)) return { error: "Fecha inválida" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("importacion_anotar", {
    p_item: datos.itemId,
    p_eta: datos.eta || null,
    p_nota: datos.nota,
  });
  if (error) return { error: error.message };
  revalidatePath("/importaciones");
  return { error: null, n: (data as number) ?? 0 };
}
