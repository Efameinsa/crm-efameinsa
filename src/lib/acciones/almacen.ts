"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar } from "@/lib/notificaciones";
import type { FotoAlmacen } from "@/lib/postventa";

/**
 * Lo que el almacén marca del pedido (0246), en el orden en que pasa:
 * probado y embalado (con el protocolo) → listo para el despacho programado
 * → la salida (5 fotos y video) → la guía en la agencia. Cada paso avisa a
 * postventa, que es quien sigue el circuito; el doble check final es suyo.
 *
 * Todas las reglas viven en la base (quién puede, qué falta): acá solo se
 * pide y se traduce la respuesta.
 */
const limpiar = (e: string) => e.replace(/^[A-Z0-9]{5}:\s*/, "");

function ok(servicioId: string) {
  revalidatePath(`/almacen/pedidos/${servicioId}`);
  revalidatePath("/almacen");
  revalidatePath("/almacen/pedidos");
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath("/postventa/control");
  return { error: null as string | null };
}

type Foto = FotoAlmacen;

/** Avisa a toda el área de postventa (sin las cuentas de práctica, salvo que quien avisa sea de práctica). */
async function avisarPostventa(titulo: string, cuerpo: string, url: string) {
  const supabase = await createClient();
  const perfil = await requerirPerfil();
  const { data } = await supabase
    .from("perfiles")
    .select("id")
    .eq("es_postventa", true)
    .eq("activo", true)
    .eq("es_prueba", perfil.es_prueba === true);
  await Promise.all((data ?? []).map((p) => notificar({ userId: p.id, tipo: "almacen", titulo, cuerpo, url })));
}

export async function marcarProbado(servicioId: string, datos: { protocoloRef?: string; fotos?: Foto[]; nota?: string; cliente: string }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("almacen_marcar_probado", {
    p_servicio: servicioId,
    p_protocolo_ref: datos.protocoloRef?.trim() || null,
    p_fotos: datos.fotos ?? [],
    p_nota: datos.nota?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  await avisarPostventa(
    `Probado y embalado · ${datos.cliente}`,
    `El almacén ya probó y embaló el equipo${datos.protocoloRef ? ` (protocolo ${datos.protocoloRef})` : ""}. Se puede programar el despacho.`,
    `/postventa/pedidos/${servicioId}`,
  );
  return ok(servicioId);
}

export async function confirmarListo(servicioId: string, datos: { nota?: string; cliente: string; fecha: string | null }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("almacen_confirmar_listo", { p_servicio: servicioId, p_nota: datos.nota?.trim() || null });
  if (error) return { error: limpiar(error.message) };
  await avisarPostventa(
    `Almacén listo para despachar · ${datos.cliente}`,
    `${datos.fecha ? `Para el ${datos.fecha}. ` : ""}${datos.nota?.trim() ?? ""}`.trim() || "Almacén confirmó que el despacho programado está listo.",
    `/postventa/pedidos/${servicioId}`,
  );
  return ok(servicioId);
}

export async function registrarSalida(servicioId: string, datos: { fecha: string; fotos: Foto[]; nota?: string; cliente: string }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("almacen_registrar_salida", {
    p_servicio: servicioId,
    p_fecha: datos.fecha,
    p_fotos: datos.fotos,
    p_nota: datos.nota?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  await avisarPostventa(
    `Salió del almacén · ${datos.cliente}`,
    `El ${datos.fecha}, con ${datos.fotos.length} fotos/video. Falta la guía de la agencia y su doble check.`,
    `/postventa/pedidos/${servicioId}`,
  );
  return ok(servicioId);
}

export async function registrarAgencia(
  servicioId: string,
  datos: { transportista?: string; guia: string; fotos: Foto[]; recibe?: string; cliente: string },
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("almacen_registrar_agencia", {
    p_servicio: servicioId,
    p_transportista: datos.transportista?.trim() || null,
    p_guia: datos.guia.trim(),
    p_fotos: datos.fotos,
    p_recibe: datos.recibe?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  await avisarPostventa(
    `Entregado en agencia · ${datos.cliente}`,
    `${datos.transportista ? `${datos.transportista} · ` : ""}guía ${datos.guia}. Verifique el envío y mándele la guía al cliente.`,
    `/postventa/pedidos/${servicioId}`,
  );
  return ok(servicioId);
}

/** El doble check de postventa (0246). */
export async function verificarDespacho(servicioId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("verificar_despacho", { p_servicio: servicioId });
  if (error) return { error: limpiar(error.message) };
  return ok(servicioId);
}
