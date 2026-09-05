"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";

/**
 * Lo que el comercial declara al cerrar su semana.
 *
 * Carlos, 02-09: «que tenga un campo obligatorio para que redactes cuál es tu
 * plan para la siguiente semana. No me hables de que vas a llamar a 10
 * clientes el lunes, porque ya está mapeado (…) háblame de qué es lo que vas a
 * hacer TÚ para poder mejorar en tus ventas. Es decir, la pregunta del millón:
 * ¿qué necesitas?»
 *
 * Se guarda una por comercial y por semana, y se puede corregir mientras la
 * semana esté fresca: el sábado a las doce nadie escribe bien a la primera.
 * Las de semanas pasadas quedan como quedaron — son el registro contra el que
 * gerencia pregunta el lunes.
 */
export async function guardarDeclaracionSemana(datos: {
  lunes: string;
  compromiso: string;
  necesidades: string;
  sinNecesidades: boolean;
}): Promise<{ error: string | null }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const compromiso = datos.compromiso.trim();
  const necesidades = datos.necesidades.trim();

  if (compromiso.length < 15) {
    return { error: "Escriba qué va a hacer para mejorar sus ventas. Una línea de verdad, no dos palabras." };
  }
  if (!datos.sinNecesidades && necesidades.length < 5) {
    return { error: "Diga qué necesita, o marque que no necesita nada esta semana." };
  }

  const fila = {
    comercial_id: perfil.id,
    lunes: datos.lunes,
    compromiso,
    necesidades: datos.sinNecesidades ? null : necesidades,
    sin_necesidades: datos.sinNecesidades,
    actualizado_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("declaraciones_semana")
    .upsert(fila, { onConflict: "comercial_id,lunes" });
  if (error) return { error: error.message };

  revalidatePath("/comercial");
  revalidatePath("/gerencia");
  return { error: null };
}

/** La declaración de esa semana, para volver a mostrarla y poder corregirla. */
export async function leerDeclaracionSemana(lunes: string): Promise<{
  compromiso: string;
  necesidades: string;
  sinNecesidades: boolean;
} | null> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase
    .from("declaraciones_semana")
    .select("compromiso, necesidades, sin_necesidades")
    .eq("comercial_id", perfil.id)
    .eq("lunes", lunes)
    .maybeSingle();
  if (!data) return null;
  return {
    compromiso: data.compromiso,
    necesidades: data.necesidades ?? "",
    sinNecesidades: data.sin_necesidades,
  };
}
