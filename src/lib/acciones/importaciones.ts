"use server";

// IMPORTACIONES (0402, 06-10): lo que falta importar para los pedidos y la
// fecha en que llega. Todo pasa por funciones de la base que validan quién
// puede (importaciones, almacén, operaciones, gerencia).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { avisarQueLlegoLaMaquina } from "@/lib/avisar-llegada";

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

/**
 * «Llegó · avisar a Central» (23-10): la máquina por importar ya está en planta.
 * Con serie, queda puesta en el pedido y la máquina reservada; sin serie, solo
 * se anota la llegada. En los dos casos Central y quien lleva el pedido se enteran.
 */
export async function avisarQueLlego(datos: { itemId: string; pedidoId: string; descripcion: string | null; serie: string }): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const serie = datos.serie.trim().toUpperCase();
  const hoy = hoyLima();
  const { error: e1 } = await supabase.rpc("importacion_anotar", { p_item: datos.itemId, p_eta: hoy, p_nota: `Llegó el ${hoy.split("-").reverse().join("/")}${serie ? ` · serie ${serie}` : ""}` });
  if (e1) return { error: e1.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  if (serie) {
    const { error: e2 } = await supabase.rpc("registrar_serie_del_equipo", { p_item: datos.itemId, p_serie: serie, p_garantia_meses: 24 });
    if (e2) return { error: e2.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  } else {
    // Quita el «sin stock» si lo tenía (0464); si no, no hace nada.
    await supabase.rpc("marcar_sin_stock", { p_item: datos.itemId, p_motivo: null });
  }
  await avisarQueLlegoLaMaquina(supabase, { servicioId: datos.pedidoId, descripcion: datos.descripcion, serie: serie || null });
  revalidatePath("/importaciones");
  revalidatePath(`/nuevo/pedido/${datos.pedidoId}`);
  revalidatePath(`/postventa/pedidos/${datos.pedidoId}`);
  revalidatePath(`/almacen/pedidos/${datos.pedidoId}`);
  return { error: null };
}
