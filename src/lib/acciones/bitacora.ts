"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Las actividades del día escritas a mano (migración 0063).
//
// Es la única sección del informe de Central que el sistema no puede armar
// solo: "ingresé al sistema", "revisé correos", "fin de mis labores". El resto
// —contactos, derivaciones y presupuestos— sale de lo que ya quedó registrado.

export async function agregarActividadDia(datos: {
  fecha: string;
  texto: string;
}): Promise<{ error: string | null }> {
  const texto = datos.texto.trim();
  if (!texto) return { error: "Escriba la actividad" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) return { error: "Fecha inválida" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  // El orden es el siguiente número libre del día: la lista se lee como la
  // numerada del informe en Word, del 1 en adelante.
  const { data: ultima } = await supabase
    .from("bitacora_dia")
    .select("orden")
    .eq("perfil_id", user.id)
    .eq("fecha", datos.fecha)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("bitacora_dia").insert({
    perfil_id: user.id,
    fecha: datos.fecha,
    orden: (ultima?.orden ?? 0) + 1,
    texto,
  });
  if (error) return { error: error.message };

  revalidatePath("/central/informe");
  return { error: null };
}

export async function borrarActividadDia(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("bitacora_dia").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Esa actividad no es suya" };

  revalidatePath("/central/informe");
  return { error: null };
}
