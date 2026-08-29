"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Las tres listas que el CRM pone en sus desplegables (migración 0118).
// El código de un resultado no se toca nunca —hay reglas que lo comparan— y la
// base lo impide; acá solo se pasa el nombre y el estado.

const TABLA: Record<string, string> = {
  rubros: "catalogo_rubros",
  motivos: "catalogo_motivos_rechazo",
  resultados: "catalogo_resultados_gestion",
};

export async function renombrarItemLista(
  lista: string,
  id: string,
  nombre: string,
): Promise<{ error: string | null }> {
  const tabla = TABLA[lista];
  if (!tabla) return { error: "Lista desconocida" };
  const limpio = nombre.trim();
  if (limpio.length < 3) return { error: "El nombre necesita al menos tres letras" };

  const supabase = await createClient();
  const { error } = await supabase.from(tabla).update({ nombre: limpio }).eq("id", id);
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
  revalidatePath("/admin/catalogos");
  return { error: null };
}

/**
 * Retirar no es borrar, por la misma razón que anular no es borrar: los
 * registros viejos siguen apuntando ahí. Un motivo retirado deja de ofrecerse
 * en el desplegable y las 2.451 oportunidades que ya lo tienen siguen diciendo
 * por qué se perdieron.
 */
export async function activarItemLista(
  lista: string,
  id: string,
  activo: boolean,
): Promise<{ error: string | null }> {
  const tabla = TABLA[lista];
  if (!tabla) return { error: "Lista desconocida" };

  const supabase = await createClient();
  const { error } = await supabase.from(tabla).update({ activo }).eq("id", id);
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
  revalidatePath("/admin/catalogos");
  return { error: null };
}

export async function agregarItemLista(lista: string, nombre: string): Promise<{ error: string | null }> {
  const tabla = TABLA[lista];
  if (!tabla) return { error: "Lista desconocida" };
  const limpio = nombre.trim();
  if (limpio.length < 3) return { error: "El nombre necesita al menos tres letras" };

  const supabase = await createClient();
  // Los resultados de gestión llevan código porque el programa los compara; se
  // deriva del nombre y queda fijo desde el nacimiento.
  const fila: Record<string, unknown> =
    lista === "resultados"
      ? {
          nombre: limpio,
          activo: true,
          codigo: limpio
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "_")
            .slice(0, 20)
            .replace(/_+$/, ""),
        }
      : { nombre: limpio, activo: true };

  const { error } = await supabase.from(tabla).insert(fila);
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
  revalidatePath("/admin/catalogos");
  return { error: null };
}
