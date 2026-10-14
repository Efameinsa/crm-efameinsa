"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import type { FotoAlmacen } from "@/lib/postventa";
import type { Chequeo } from "@/lib/protocolo-checklist";

/**
 * EL PROTOCOLO DE LOS EQUIPOS EN STOCK (0474; Lesly, 14-10). Lo mismo que el
 * protocolo de una máquina del pedido, pero por serie y sin pedido todavía.
 * Al terminarlo pasa solo a la máquina del pedido con esa serie. Las reglas
 * (quién, qué falta, que no se repita la serie) viven en la base.
 */
const limpiar = (e: string) => e.replace(/^[A-Z0-9]{5}:\s*/, "");

function listo(id?: string) {
  revalidatePath("/almacen/protocolos");
  if (id) revalidatePath(`/almacen/protocolos/stock/${id}`);
  return { error: null as string | null };
}

export async function crearProtocoloDeStock(datos: {
  tipo: string;
  marca: string;
  modelo: string;
  capacidad: string;
  serie: string;
  protocoloRef: string;
  tecnico: string;
  fecha: string;
}): Promise<{ error: string | null; id?: string }> {
  await requerirPerfil();
  const supabase = await createClient();
  const tipo = datos.tipo.trim().toUpperCase();
  const capacidad = datos.capacidad.trim().toUpperCase();
  // La descripción como la de un cierre; el título de la hoja como el Word: «LAVADORA 13 KG».
  const descripcion = [tipo, datos.marca.trim().toUpperCase(), datos.modelo.trim() && `MODELO: ${datos.modelo.trim().toUpperCase()}`, capacidad && `CAPACIDAD: ${capacidad}`]
    .filter(Boolean)
    .join(" ");
  const { data, error } = await supabase.rpc("protocolo_stock_crear", {
    p_descripcion: descripcion,
    p_serie: datos.serie,
    p_protocolo_ref: datos.protocoloRef,
    p_datos: { equipo: [tipo, capacidad].filter(Boolean).join(" "), modelo: datos.modelo, tecnico: datos.tecnico, fecha_ejecucion: datos.fecha },
  });
  if (error) return { error: limpiar(error.message) };
  listo();
  return { error: null, id: data as string };
}

export async function cabeceraDelProtocoloDeStock(id: string, protocoloRef: string, nota: string) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("protocolo_stock_cabecera", { p_id: id, p_protocolo_ref: protocoloRef, p_nota: nota });
  if (error) return { error: limpiar(error.message) };
  return listo(id);
}

export async function archivosDelProtocoloDeStock(id: string, archivos: FotoAlmacen[]) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("protocolo_stock_archivos", { p_id: id, p_archivos: archivos });
  if (error) return { error: limpiar(error.message) };
  return listo(id);
}

export async function datosDelProtocoloDeStock(id: string, datos: Record<string, string>) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("protocolo_stock_datos", { p_id: id, p_datos: datos });
  if (error) return { error: limpiar(error.message) };
  return listo(id);
}

export async function chequeoDelProtocoloDeStock(id: string, chequeo: Chequeo) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("protocolo_stock_chequeo", { p_id: id, p_chequeo: chequeo });
  if (error) return { error: limpiar(error.message) };
  return listo(id);
}

/** Lo da por terminado; si la serie ya estaba en un pedido esperando prueba, el protocolo pasa ahí. */
export async function terminarProtocoloDeStock(id: string): Promise<{ error: string | null; pasoAPedido?: string | null }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("protocolo_stock_terminar", { p_id: id });
  if (error) return { error: limpiar(error.message) };
  let pasoAPedido: string | null = null;
  if (data) {
    const { data: pe } = await supabase.from("pedido_equipos").select("servicio_id").eq("id", data as string).maybeSingle();
    pasoAPedido = (pe?.servicio_id as string | undefined) ?? null;
    if (pasoAPedido) {
      revalidatePath(`/almacen/pedidos/${pasoAPedido}`);
      revalidatePath(`/pedidos/${pasoAPedido}/protocolo`);
    }
  }
  listo(id);
  return { error: null, pasoAPedido };
}
