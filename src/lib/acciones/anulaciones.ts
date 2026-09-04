"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";

/**
 * El comercial pide anular un cierre que ya salió; operaciones lo ejecuta.
 *
 * Carlos, 04-09 (14:30), sobre una venta que se cayó después de facturada:
 * «que el administrador operativo tenga la función de anular el pedido. El
 * comercial manda un clip: necesito anular el pedido, y pone todas sus
 * historias. Le llega al administrador; ingresa, anula. En la central sale
 * anulado por Lesly, operaciones».
 *
 * El pedido queda en `anulaciones_solicitadas` y el aviso llega a operaciones y
 * gerencia (migración 0170). Anular sigue exigiendo el código de autorización:
 * arrastra la venta, los números de la semana y lo que postventa ya hizo.
 */
export async function pedirAnulacionCierre(
  informeId: string,
  motivo: string,
): Promise<{ error: string | null; codigo?: string; repetido?: boolean }> {
  await requerirPerfil();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("solicitar_anulacion_cierre", {
    p_informe: informeId,
    p_motivo: motivo,
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  const r = (data ?? {}) as { codigo?: string; repetido?: boolean };
  revalidatePath("/comercial/cierres");
  revalidatePath(`/comercial/cierres/${informeId}`);
  revalidatePath("/central/cierres");
  return { error: null, codigo: r.codigo, repetido: r.repetido };
}

/**
 * Operaciones decide que el pedido no procede: se cierra sin anular nada.
 *
 * Existe para que la bandeja no acumule pedidos viejos que ya se resolvieron
 * por teléfono. El pedido no se borra: queda con su resultado, como todo acá.
 */
export async function descartarPedidoAnulacion(
  solicitudId: string,
): Promise<{ error: string | null }> {
  const perfil = await requerirPerfil();
  if (!["gerencia", "admin", "operaciones"].includes(perfil.rol) && !perfil.es_operaciones) {
    return { error: "Solo operaciones o gerencia cierran un pedido de anulación" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("anulaciones_solicitadas")
    .update({ atendida_at: new Date().toISOString(), atendida_por: perfil.id, resultado: "descartada" })
    .eq("id", solicitudId)
    .is("atendida_at", null);
  if (error) return { error: error.message };
  revalidatePath("/central/cierres");
  return { error: null };
}
