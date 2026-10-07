"use server";

// EL DIRECTORIO (0410, Lesly 06-10): quién tiene qué correo, de las dos
// empresas, y la relación de técnicos con su DNI. Lo mantienen gerencia y
// operaciones; la base lo vuelve a verificar con sus políticas.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { AREAS_DE_AVISO } from "@/lib/directorio";

type Resultado = { error: string | null };

const limpio = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
const correo = (v: string | null | undefined) => limpio(v)?.toLowerCase() ?? null;
const correoValido = (v: string | null) => v === null || /^[^\s@]+@[^\s@]+\.[a-z]{2,}(\.[a-z]{2,})?$/i.test(v);

async function puedeEditar() {
  const perfil = await requerirPerfil();
  return perfil.rol === "gerencia" || perfil.rol === "admin" || perfil.es_operaciones === true ? perfil : null;
}

export async function guardarPersonaDirectorio(datos: {
  id: string | null;
  nombre: string;
  area: string;
  correoEfameinsa: string;
  correoOpen: string;
  telefono: string;
  avisos: string[];
  activo: boolean;
}): Promise<Resultado> {
  const perfil = await puedeEditar();
  if (!perfil) return { error: "El directorio lo actualizan gerencia y operaciones" };
  const fila = {
    nombre: limpio(datos.nombre),
    area: limpio(datos.area),
    correo_efameinsa: correo(datos.correoEfameinsa),
    correo_open: correo(datos.correoOpen),
    telefono: limpio(datos.telefono)?.replace(/[^\d+ ]/g, "") ?? null,
    avisos: datos.avisos.filter((a) => AREAS_DE_AVISO.some((x) => x.clave === a)),
    activo: datos.activo,
    updated_at: new Date().toISOString(),
    updated_by: perfil.id,
  };
  if (!fila.nombre) return { error: "Falta el nombre" };
  if (!fila.area) return { error: "Falta el área" };
  if (!correoValido(fila.correo_efameinsa) || !correoValido(fila.correo_open)) return { error: "Uno de los correos está mal escrito" };
  if (fila.avisos.length && !fila.correo_efameinsa && !fila.correo_open) return { error: "Para recibir avisos necesita al menos un correo" };

  const supabase = await createClient();
  const { error } = datos.id
    ? await supabase.from("directorio").update(fila).eq("id", datos.id)
    : await supabase.from("directorio").insert({ ...fila, orden: 99 });
  if (error) return { error: error.message };
  revalidatePath("/directorio");
  return { error: null };
}

export async function guardarTecnico(datos: { id: string | null; nombre: string; dni: string; activo: boolean }): Promise<Resultado> {
  const perfil = await puedeEditar();
  if (!perfil) return { error: "La relación de técnicos la actualizan gerencia y operaciones" };
  const nombre = limpio(datos.nombre)?.replace(/\s+/g, " ") ?? null;
  const dni = limpio(datos.dni)?.replace(/\D/g, "") ?? null;
  if (!nombre) return { error: "Falta el nombre del técnico" };
  if (dni && !/^\d{8,9}$/.test(dni)) return { error: "El DNI tiene 8 dígitos (o 9 si es carné de extranjería)" };
  const supabase = await createClient();
  const fila = { nombre, dni, activo: datos.activo, updated_at: new Date().toISOString() };
  const { error } = datos.id
    ? await supabase.from("tecnicos").update(fila).eq("id", datos.id)
    : await supabase.from("tecnicos").insert({ ...fila, orden: 99 });
  if (error) return { error: error.message };
  revalidatePath("/directorio");
  return { error: null };
}
