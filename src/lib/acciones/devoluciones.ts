"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar } from "@/lib/notificaciones";

/**
 * Central devuelve al comercial un cierre mal hecho.
 *
 * Carlos, 05-09, viendo un cierre con un voucher que era de otro cliente:
 * «¿qué has hecho con ese registro que lo ha ingresado de manera incorrecta?
 * ¿Pero para qué, si está mal? Tendrías que rechazarlo y que lo haga bien
 * (…). Vamos a deformar el CRM; el CRM es sensible, hay que tratarlo con
 * cariño si no se nos complica en los números».
 *
 * Devolver no es anular: el cierre conserva su número. Lo que hace es sacarlo
 * de la cola de Central y ponérselo al comercial delante, con el motivo
 * escrito, hasta que lo arregle.
 */
export async function devolverCierre(informeId: string, motivo: string): Promise<{ error: string | null }> {
  await requerirPerfil();
  const supabase = await createClient();

  if (motivo.trim().length < 15) {
    return { error: "Escriba qué está mal. El comercial solo va a leer eso para corregirlo." };
  }

  const { data, error } = await supabase.rpc("devolver_cierre", {
    p_informe: informeId,
    p_motivo: motivo.trim(),
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  const r = data as { codigo: string | null; comercial: string | null };
  if (r?.comercial) {
    await notificar({
      userId: r.comercial,
      tipo: "cierre_devuelto",
      titulo: `Central le devolvió el cierre ${r.codigo ?? ""}`.trim(),
      cuerpo: motivo.trim(),
      url: "/comercial/cierres",
    });
  }

  revalidatePath("/central/cierres");
  revalidatePath("/comercial/cierres");
  return { error: null };
}

/** El comercial dice «ya está corregido» y el cierre vuelve a la cola de Central. */
export async function reenviarCierreDevuelto(
  informeId: string,
  nota: string,
): Promise<{ error: string | null }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("reenviar_cierre_devuelto", {
    p_informe: informeId,
    p_nota: nota.trim() || null,
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  const r = data as { codigo: string | null };
  await notificar({
    rol: "central",
    tipo: "cierre_corregido",
    titulo: `${perfil.nombre} corrigió el cierre ${r?.codigo ?? ""}`.trim(),
    cuerpo: nota.trim() || "Vuelve a la cola para liberar.",
    url: "/central/cierres",
  });

  revalidatePath("/central/cierres");
  revalidatePath("/comercial/cierres");
  return { error: null };
}
