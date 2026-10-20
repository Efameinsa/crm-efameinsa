"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPerfil } from "@/lib/auth";

/**
 * EL ORDEN DE LAS FOTOS DEL PROTOCOLO (gerencia 20-10, Beneficencia de
 * Huancayo): «está bien deforme… primero es la placa, la máquina general y
 * después la foto específica». Lesly: «no se puede, solo se agrega la foto».
 * Ahora quien sube el protocolo (almacén, postventa, operaciones, gerencia)
 * las ordena; el orden queda guardado y es el que sale impreso.
 */
export async function reordenarFotosProtocolo(itemId: string, servicioId: string, rutas: string[]): Promise<{ error: string | null }> {
  await requerirPerfil();
  const supabase = await createClient();
  const permisos = await Promise.all(["es_almacen", "puede_postventa", "es_backoffice", "es_operaciones"].map((f) => supabase.rpc(f)));
  if (!permisos.some((r) => r.data === true)) return { error: "El orden lo cambian el almacén, postventa u operaciones." };

  const admin = createAdminClient();
  const { data: item } = await admin.from("pedido_equipos").select("id, servicio_id, protocolo_fotos").eq("id", itemId).maybeSingle();
  if (!item || item.servicio_id !== servicioId) return { error: "No se encontró esa máquina del pedido." };
  const actuales = ((item.protocolo_fotos ?? []) as ({ path: string } | null)[]).filter((f): f is { path: string } => Boolean(f?.path));
  const porRuta = new Map(actuales.map((f) => [f.path, f]));
  const ordenadas = rutas.map((r) => porRuta.get(r)).filter((f): f is { path: string } => Boolean(f));
  // Lo que no vino en la lista (videos, documentos) se queda al final, sin perderse.
  const resto = actuales.filter((f) => !rutas.includes(f.path));
  if (ordenadas.length + resto.length !== actuales.length) return { error: "La lista de fotos cambió mientras ordenaba. Recargue y vuelva a intentarlo." };
  const { error } = await admin.from("pedido_equipos").update({ protocolo_fotos: [...ordenadas, ...resto] }).eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath(`/pedidos/${servicioId}/protocolo`);
  return { error: null };
}
