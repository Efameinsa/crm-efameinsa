"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RolUsuario } from "@/types/database";

// Alta y mantenimiento de usuarios desde el CRM. Hasta ahora había que crear
// la cuenta en el panel de Supabase y agregar la fila en `perfiles` a mano (o
// correr scripts/crear-comerciales.mjs), que es justo lo que no puede depender
// de quien sepa entrar al panel.
//
// REPARTO DE RESPONSABILIDADES, a propósito:
//  · CREAR la cuenta de acceso necesita el service_role (es la única forma de
//    dar de alta en Supabase Auth). Se usa en esta única acción y solo después
//    de comprobar que quien la ejecuta es administrador.
//  · CAMBIAR rol, código o estado NO lo necesita: la política `perfiles_admin`
//    ya deja escribir a los administradores. Se usa el cliente normal para que
//    la base siga siendo la que decide, no este archivo.

const ROLES = ["admin", "gerencia", "central", "comercial"] as const;

const esquemaNuevo = z.object({
  nombre: z.string().trim().min(3, "El nombre es muy corto"),
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  rol: z.enum(ROLES, { message: "Elija un tipo de usuario" }),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,3}[0-9]{0,2}$/, "El código va como C1, C10 o PV")
    .optional()
    .or(z.literal("")),
});

/** Contraseña temporal legible: se muestra una sola vez y se cambia después. */
function claveTemporal(): string {
  return randomBytes(9).toString("base64url");
}

function mensajeDeError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Ese código ya está en uso por otro usuario";
  if (error.code === "23514") return "Un comercial activo necesita código (C1, C4, PV…)";
  return error.message;
}

export async function crearUsuario(
  formData: FormData,
): Promise<{ error: string | null; clave?: string }> {
  await requerirRol(["admin"]);

  const datos = esquemaNuevo.safeParse({
    nombre: formData.get("nombre"),
    email: formData.get("email"),
    rol: formData.get("rol"),
    codigo: formData.get("codigo") ?? "",
  });
  if (!datos.success) return { error: datos.error.issues[0].message };

  const { nombre, email, rol } = datos.data;
  const codigo = datos.data.codigo || null;
  if (rol === "comercial" && !codigo) {
    return { error: "Un comercial necesita un código: es lo que identifica su cartera" };
  }
  if (rol !== "comercial" && codigo) {
    return { error: "El código es solo para comerciales" };
  }

  const admin = createAdminClient();
  const clave = claveTemporal();
  const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
    email,
    password: clave,
    email_confirm: true,
  });
  if (errorAuth || !creado?.user) {
    const yaExiste = /already been registered|already exists/i.test(errorAuth?.message ?? "");
    return { error: yaExiste ? "Ya hay una cuenta con ese correo" : (errorAuth?.message ?? "No se pudo crear la cuenta") };
  }

  const { error: errorPerfil } = await admin
    .from("perfiles")
    .insert({ id: creado.user.id, nombre, rol, codigo_comercial: codigo, activo: true, email_contacto: email });

  if (errorPerfil) {
    // Sin perfil, la cuenta de acceso no sirve para nada y además dejaría un
    // correo ocupado que impide reintentar. Se deshace el alta.
    await admin.auth.admin.deleteUser(creado.user.id);
    return { error: mensajeDeError(errorPerfil) };
  }

  revalidatePath("/admin");
  return { error: null, clave };
}

const esquemaCambio = z.object({
  id: z.string().uuid(),
  rol: z.enum(ROLES),
  codigo: z.string().trim().toUpperCase().optional().or(z.literal("")),
});

export async function actualizarUsuario(formData: FormData): Promise<{ error: string | null }> {
  const yo = await requerirRol(["admin"]);

  const datos = esquemaCambio.safeParse({
    id: formData.get("id"),
    rol: formData.get("rol"),
    codigo: formData.get("codigo") ?? "",
  });
  if (!datos.success) return { error: datos.error.issues[0].message };

  const { id, rol } = datos.data;
  const codigo = datos.data.codigo || null;
  if (id === yo.id && rol !== "admin") {
    return { error: "No puede quitarse a usted mismo el rol de administrador" };
  }
  if (rol === "comercial" && !codigo) return { error: "Un comercial necesita un código" };
  if (rol !== "comercial" && codigo) return { error: "El código es solo para comerciales" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("perfiles")
    .update({ rol: rol as RolUsuario, codigo_comercial: codigo })
    .eq("id", id)
    .select("id");
  if (error) return { error: mensajeDeError(error) };
  if (!data?.length) return { error: "Solo un administrador puede cambiar usuarios" };

  revalidatePath("/admin");
  return { error: null };
}

export async function cambiarEstadoUsuario(id: string, activo: boolean): Promise<{ error: string | null }> {
  const yo = await requerirRol(["admin"]);
  if (id === yo.id && !activo) return { error: "No puede desactivarse a usted mismo" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("perfiles").update({ activo }).eq("id", id).select("id");
  if (error) return { error: mensajeDeError(error) };
  if (!data?.length) return { error: "Solo un administrador puede cambiar usuarios" };

  revalidatePath("/admin");
  return { error: null };
}
