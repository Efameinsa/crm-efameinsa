"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar, notificarAlmacen, notificarCentral, notificarFinanzas } from "@/lib/notificaciones";

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
    titulo: `Generación de código · ${sinRuc(s?.cliente_texto)}`,
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

/**
 * LA SIRENA A FINANZAS (0298). Central, 24-09: «a veces hay pedidos urgentes
 * porque el cliente requiere factura o quieren despachar; necesito mandar
 * una alerta a Finanzas para que se apure, así tal cual con Comercial».
 *
 * Es el mismo canal de la urgencia al comercial (0082): a Finanzas le llega
 * en vivo una ventanita que no se cierra sola, con campanada y push que se
 * queda en el celular; el pedido sube al primer lugar de «Pagos por
 * confirmar» con la razón a la vista. Del segundo aviso por el mismo pedido
 * en adelante, gerencia también se entera.
 */
export async function enviarUrgenciaFinanzas(servicioId: string, mensaje: string): Promise<{ error: string | null; avisoNumero?: number }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enviar_urgencia_finanzas", { p_servicio: servicioId, p_mensaje: mensaje.trim() || null });
  if (error) return { error: limpiar(error.message) };
  const r = data as { servicio_id: string; cliente: string; numero_pedido: string | null; es_prueba: boolean; aviso_numero: number };

  const detalle = mensaje.trim() || "Central pide confirmar este pago de inmediato.";
  const pedido = r.numero_pedido ? ` (pedido ${r.numero_pedido})` : "";
  await notificarFinanzas({
    tipo: "urgencia_finanzas",
    titulo: `${r.cliente}${pedido} está esperando a Finanzas`,
    cuerpo: detalle,
    url: `/finanzas/pedidos/${r.servicio_id}`,
    esPrueba: r.es_prueba,
  });

  // Igual que con el comercial: si hizo falta avisar dos veces, ya no es un
  // olvido y gerencia lo ve. Lo de práctica no le llega a gerencia real.
  if (r.aviso_numero >= 2 && !r.es_prueba) {
    await notificar({
      rol: "gerencia",
      tipo: "urgencia",
      titulo: `${r.cliente}${pedido} sigue esperando a Finanzas`,
      cuerpo: `Central ya le mandó ${r.aviso_numero} avisos de urgencia a Finanzas por este pedido. ${detalle}`,
      url: `/finanzas/pedidos/${r.servicio_id}`,
    });
  }

  revalidar(servicioId);
  revalidatePath("/central/pedidos");
  revalidatePath(`/finanzas/pedidos/${servicioId}`);
  return { error: null, avisoNumero: r.aviso_numero };
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
