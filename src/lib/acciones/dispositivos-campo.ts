"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/auth";
import { generarToken } from "@/lib/campo-osmand";

/**
 * Vincular y desactivar el celular de quien está en el piloto de trabajo de
 * campo (0367; Ing. Carlos vía Santos, 01-10-2026: «como Uber o inDrive»).
 *
 * Va por el cliente normal: la política de `dispositivos_campo` solo deja a
 * gerencia y admin, y eso manda aunque alguien llame a la acción a mano.
 * Vincular uno nuevo desactiva el anterior de esa persona: un celular por
 * persona, y si se cambió de equipo o el token se compartió de más, el viejo
 * deja de anotar en el acto.
 */

const uuid = z.string().uuid();

export async function vincularCelular(
  userId: string,
): Promise<{ error?: string; token?: string }> {
  await requerirRol(["gerencia", "admin"]);
  if (!uuid.safeParse(userId).success) return { error: "Persona no válida." };
  const supabase = await createClient();

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre, trabajo_de_campo")
    .eq("id", userId)
    .maybeSingle();
  if (!perfil?.trabajo_de_campo) {
    return { error: "Esa persona no está marcada para el piloto de trabajo de campo." };
  }

  const { error: errorViejo } = await supabase
    .from("dispositivos_campo")
    .update({ activo: false })
    .eq("user_id", userId)
    .eq("activo", true);
  if (errorViejo) return { error: `No se pudo desactivar el celular anterior: ${errorViejo.message}` };

  const token = generarToken();
  const { error } = await supabase.from("dispositivos_campo").insert({
    user_id: userId,
    token,
    nombre: `Celular de ${(perfil.nombre as string | null) ?? "campo"}`,
  });
  if (error) return { error: `No se pudo vincular: ${error.message}` };

  revalidatePath("/gerencia/accesos");
  return { token };
}

export async function desactivarCelular(dispositivoId: string): Promise<{ error?: string }> {
  await requerirRol(["gerencia", "admin"]);
  if (!uuid.safeParse(dispositivoId).success) return { error: "Celular no válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("dispositivos_campo").update({ activo: false }).eq("id", dispositivoId);
  if (error) return { error: `No se pudo desactivar: ${error.message}` };
  revalidatePath("/gerencia/accesos");
  return {};
}
