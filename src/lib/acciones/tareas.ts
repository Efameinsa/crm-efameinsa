"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Tareas personales de la agenda (migración 0028): sin cliente, del propio
// comercial. RLS garantiza que cada uno solo toca las suyas.

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{2}:\d{2}$/;

export async function crearTarea(datos: {
  titulo: string;
  fecha: string;
  hora: string | null;
}): Promise<{ error: string | null; id?: string }> {
  const titulo = datos.titulo.trim();
  if (!titulo) return { error: "Escriba el título de la tarea" };
  if (!RE_FECHA.test(datos.fecha)) return { error: "Fecha inválida" };
  if (datos.hora !== null && !RE_HORA.test(datos.hora)) return { error: "Hora inválida" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { data, error } = await supabase
    .from("tareas_agenda")
    .insert({ comercial_id: user.id, titulo, fecha: datos.fecha, hora: datos.hora })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/comercial/agenda");
  // Desde el 31-08 (plan 23, etapa 2) las tareas también se pintan en el
  // calendario del área: crear una tiene que refrescarlo igual.
  revalidatePath("/postventa/agenda");
  return { error: null, id: data.id };
}

export async function actualizarTarea(datos: {
  id: string;
  fecha?: string;
  hora?: string | null;
  completada?: boolean;
}): Promise<{ error: string | null }> {
  if (datos.fecha !== undefined && !RE_FECHA.test(datos.fecha)) return { error: "Fecha inválida" };
  if (datos.hora !== undefined && datos.hora !== null && !RE_HORA.test(datos.hora)) return { error: "Hora inválida" };

  const supabase = await createClient();
  const cambios: Record<string, unknown> = {};
  if (datos.fecha !== undefined) cambios.fecha = datos.fecha;
  if (datos.hora !== undefined) cambios.hora = datos.hora;
  if (datos.completada !== undefined) cambios.completada = datos.completada;

  const { data, error } = await supabase.from("tareas_agenda").update(cambios).eq("id", datos.id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Solo el dueño de la tarea puede modificarla" };

  revalidatePath("/comercial/agenda");
  return { error: null };
}

export async function eliminarTarea(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tareas_agenda").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/comercial/agenda");
  return { error: null };
}
