"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificarAlmacen, notificarCentral, notificarFinanzas } from "@/lib/notificaciones";

// EL CIERRE SE CONVIERTE EN PEDIDO (0290, reunión de Santos con Carlos, 23-09
// 14:58). Los pasos de Central antes de los dos checks: preparar el pedido con
// su lista de equipos, pedirle las series al almacén y generar el pedido con
// su número del CRM (0295: el paso del ERP se retiró).
// Todo reusa liberar_pedido_postventa sin marcar ningún check, que crea el
// pedido y siembra los equipos sin avisar a nadie.

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");
const sinRuc = (s: string | null | undefined) => (s ?? "").replace(/^\d{8,11}\s*-\s*/, "");

function revalidar(servicioId?: string | null) {
  revalidatePath("/central/cierres");
  revalidatePath("/almacen");
  revalidatePath("/almacen/pedidos");
  revalidatePath("/finanzas");
  if (servicioId) {
    revalidatePath(`/almacen/pedidos/${servicioId}`);
    revalidatePath(`/pedidos/${servicioId}/imprimir`);
  }
}

/** Crea el pedido y su lista de equipos, sin marcar nada. Idempotente. */
async function preparar(informeId: string, numero?: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("liberar_pedido_postventa", {
    p_informe_id: informeId,
    p_numero_pedido: numero?.trim() || null,
    p_marcar_pedido: false,
    p_marcar_liquidacion: false,
    p_pin: null,
  });
  return { supabase, servicioId: (data as string | null) ?? null, error: error ? limpiar(error.message) : null };
}

/** «Las escribo yo»: Central prepara la lista para poner las series ella misma. */
export async function prepararPedido(informeId: string) {
  await requerirPerfil();
  const { servicioId, error } = await preparar(informeId);
  if (error) return { error, servicioId: null };
  revalidar(servicioId);
  return { error: null, servicioId };
}

/** «Pedir series al almacén»: le llega el aviso y el pedido entra a su cola. */
export async function pedirSeriesAlAlmacen(informeId: string) {
  const perfil = await requerirPerfil();
  const { supabase, servicioId, error } = await preparar(informeId);
  if (error || !servicioId) return { error: error ?? "No se pudo preparar el pedido", faltan: 0 };
  const { data: faltan, error: e2 } = await supabase.rpc("pedir_series_al_almacen", { p_servicio: servicioId });
  if (e2) return { error: limpiar(e2.message), faltan: 0 };
  const { data: s } = await supabase.from("servicios_postventa").select("cliente_texto").eq("id", servicioId).maybeSingle();
  await notificarAlmacen({
    titulo: `Series por ingresar · ${sinRuc(s?.cliente_texto)}`,
    cuerpo: `Central pide la serie de ${faltan} equipo${faltan === 1 ? "" : "s"}. Escríbalas como se leen en la placa: quedan fijas.`,
    url: `/almacen/pedidos/${servicioId}`,
    esPrueba: perfil.es_prueba === true,
  });
  revalidar(servicioId);
  return { error: null, faltan: faltan as number };
}

/**
 * Central genera el pedido y el CRM le pone el número (0295). Carlos, 23-09
 * 17:24: «en el ERP ya no lo haría… este segundo paso se retira». Con el
 * número ya se puede imprimir el pedido, que va como anexo del cierre.
 */
export async function generarPedido(informeId: string) {
  await requerirPerfil();
  const { supabase, servicioId, error } = await preparar(informeId);
  if (error || !servicioId) return { error: error ?? "No se pudo preparar el pedido", servicioId: null, numero: null };
  const { data: numero, error: e2 } = await supabase.rpc("generar_pedido", { p_servicio: servicioId });
  if (e2) return { error: limpiar(e2.message), servicioId, numero: null };
  revalidar(servicioId);
  return { error: null, servicioId, numero: numero as string };
}

/**
 * Central rechaza la liquidación y vuelve a Finanzas con el motivo (0295).
 * Carlos: «en liquidación de Finanzas es acepto y rechazo… si pasa a la
 * Central el pedido todo mal, todo el camino está mal».
 */
export async function rechazarLiquidacion(servicioId: string, motivo: string) {
  const perfil = await requerirPerfil();
  if (motivo.trim().length < 5) return { error: "Diga qué está mal en la liquidación" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("central_rechazar_liquidacion", { p_servicio: servicioId, p_motivo: motivo.trim() });
  if (error) return { error: limpiar(error.message) };
  const { data: s } = await supabase.from("servicios_postventa").select("cliente_texto, numero_pedido_erp").eq("id", servicioId).maybeSingle();
  await notificarFinanzas({
    titulo: `Liquidación rechazada · ${sinRuc(s?.cliente_texto)}`,
    cuerpo: `Central la devolvió${s?.numero_pedido_erp ? ` (pedido ${s.numero_pedido_erp})` : ""}: ${motivo.trim()}. Corríjala y súbala de nuevo.`,
    url: "/finanzas/liquidar",
    esPrueba: perfil.es_prueba === true,
  });
  revalidar(servicioId);
  revalidatePath("/finanzas/liquidar");
  return { error: null };
}

/** Corregir una serie ya puesta: con el código de operaciones y el motivo (0290). */
export async function corregirSerie(itemId: string, servicioId: string, serie: string, pin: string, motivo: string) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("corregir_serie_del_equipo", { p_item: itemId, p_serie: serie, p_pin: pin, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidar(servicioId);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return { error: null };
}

/** Finanzas sube la liquidación del pedido; Central recibe el aviso (0290). */
export async function subirLiquidacion(servicioId: string, path: string, nombre: string) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("finanzas_subir_liquidacion", { p_servicio: servicioId, p_path: path, p_nombre: nombre });
  if (error) return { error: limpiar(error.message) };
  const { data: s } = await supabase.from("servicios_postventa").select("cliente_texto, numero_pedido_erp").eq("id", servicioId).maybeSingle();
  await notificarCentral({
    titulo: `Liquidación lista · ${sinRuc(s?.cliente_texto)}`,
    cuerpo: `Finanzas subió la liquidación${s?.numero_pedido_erp ? ` del pedido ${s.numero_pedido_erp}` : ""}. Revísela: acéptela o recházela con el motivo.`,
    url: "/central/cierres",
    esPrueba: perfil.es_prueba === true,
  });
  revalidar(servicioId);
  revalidatePath("/finanzas/liquidar");
  return { error: null };
}
