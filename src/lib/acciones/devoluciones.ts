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
export async function devolverCierre(
  informeId: string,
  motivo: string,
  pin?: string,
): Promise<{ error: string | null; autorizo?: string | null }> {
  await requerirPerfil();
  const supabase = await createClient();

  if (motivo.trim().length < 15) {
    return { error: "Escriba qué está mal. El comercial solo va a leer eso para corregirlo." };
  }

  // 0351: si el cierre ya avanzó, la base exige el código de gerencia. Sin
  // avance se llama igual que siempre, sin p_pin.
  const { data, error } = await supabase.rpc("devolver_cierre", {
    p_informe: informeId,
    p_motivo: motivo.trim(),
    ...(pin?.trim() ? { p_pin: pin.trim() } : {}),
  });
  // Solo se quita el código técnico: los mensajes de la base traen «:» propios
  // («El PIN de X ya cambió: pídale el nuevo») que antes se comían.
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };

  const r = data as { codigo: string | null; comercial: string | null; autorizo: string | null };
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
  return { error: null, autorizo: r?.autorizo ?? null };
}

export interface AvanceCierre {
  avanzo: boolean;
  enFinanzas: boolean;
  pasos: string[];
}

/**
 * ¿El pedido de este cierre ya avanzó? (0351, Carlos 30-09: «ya le habían
 * pedido serie… ya está en finanzas… va a tener que solicitar eso»). La regla
 * vive en la base (avance_del_cierre) para que el diálogo y devolver_cierre
 * nunca se contradigan.
 */
export async function avanceDelCierre(informeId: string): Promise<{ avance: AvanceCierre | null; error: string | null }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("avance_del_cierre", { p_informe: informeId });
  if (error) return { avance: null, error: error.message };
  const d = data as { avanzo: boolean; en_finanzas: boolean; pasos: string[] | null };
  return { avance: { avanzo: d.avanzo, enFinanzas: d.en_finanzas, pasos: d.pasos ?? [] }, error: null };
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
