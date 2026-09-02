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

// ── Borrar ───────────────────────────────────────────────────────────────
// Pedido de Santos (02-09): el admin puede desactivar, pero también tiene que
// poder BORRAR. Borrar y desactivar no son lo mismo y no se confunden:
//
//  · DESACTIVAR es para quien trabajó: la persona deja de entrar y todo lo que
//    hizo (cartera, gestiones, cotizaciones, cierres) sigue a su nombre.
//  · BORRAR es para el acceso que sobró: la cuenta creada por error, la de
//    práctica que ya no se usa, el correo mal escrito. Desaparece de auth y de
//    `perfiles`, y no vuelve a figurar en la lista.
//
// La base ya lo protege sola: las tablas con historial referencian
// perfiles(id) SIN cascada, así que un DELETE sobre alguien con clientes o
// gestiones falla con 23503. Aquí se comprueba antes, para poder decirle al
// admin QUÉ tiene esa persona en vez de un error de base, y el 23503 queda
// como red de seguridad por si aparece una tabla nueva que no esté en la lista.
//
// Los registros que sí se llevan con la cuenta son los que no son historial de
// nadie: la bitácora de accesos (quién entró y desde dónde) y los intentos de
// PIN, que solo tienen sentido mientras la cuenta existe. Notificaciones,
// suscripciones push, bitácora del día y reportes diarios ya caen en cascada.

const HISTORIAL: { tabla: string; columna: string; etiqueta: string }[] = [
  { tabla: "cuentas", columna: "comercial_id", etiqueta: "clientes en cartera" },
  { tabla: "oportunidades", columna: "comercial_id", etiqueta: "oportunidades" },
  { tabla: "actividades", columna: "realizada_por", etiqueta: "gestiones" },
  { tabla: "cotizaciones", columna: "creada_por", etiqueta: "cotizaciones" },
  { tabla: "cotizaciones_historicas", columna: "comercial_id", etiqueta: "cotizaciones del Excel" },
  { tabla: "informes_cierre", columna: "creado_por", etiqueta: "cierres" },
  { tabla: "ventas", columna: "registrada_por", etiqueta: "ventas registradas" },
  { tabla: "leads", columna: "asignado_a", etiqueta: "derivaciones recibidas" },
  { tabla: "leads", columna: "recibido_por", etiqueta: "contactos recibidos en Central" },
  { tabla: "atenciones", columna: "tomada_por", etiqueta: "atenciones de postventa" },
  { tabla: "servicios_postventa", columna: "responsable_id", etiqueta: "pedidos de postventa" },
  { tabla: "tareas_agenda", columna: "comercial_id", etiqueta: "tareas de agenda" },
  { tabla: "correlativos_reservas", columna: "perfil_id", etiqueta: "números reservados" },
];

const NOMBRE_TABLA: Record<string, string> = Object.fromEntries(HISTORIAL.map((h) => [h.tabla, h.etiqueta]));

function listar(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

export async function borrarUsuario(id: string): Promise<{ error: string | null }> {
  const yo = await requerirRol(["admin"]);
  if (!z.string().uuid().safeParse(id).success) return { error: "Usuario inválido" };
  if (id === yo.id) return { error: "No puede borrarse a usted mismo" };

  const admin = createAdminClient();

  const { data: perfil } = await admin.from("perfiles").select("id, nombre").eq("id", id).maybeSingle();
  if (!perfil) return { error: "Ese usuario ya no existe" };

  // 1. ¿Tiene historial? Se cuenta todo en paralelo y se arma una sola frase.
  const conteos = await Promise.all(
    HISTORIAL.map(async (h) => {
      const { count } = await admin.from(h.tabla).select("*", { count: "exact", head: true }).eq(h.columna, id);
      return { ...h, n: count ?? 0 };
    }),
  );
  const conHistorial = conteos.filter((c) => c.n > 0);
  if (conHistorial.length > 0) {
    const detalle = listar(conHistorial.map((c) => `${c.n.toLocaleString("es-PE")} ${c.etiqueta}`));
    return {
      error: `${perfil.nombre} tiene ${detalle}. Ese historial se conserva: desactívelo en vez de borrarlo.`,
    };
  }

  // 2. Lo que se va con la cuenta porque no es historial de nadie.
  await admin.from("intentos_pin_supervisor").delete().eq("solicitante_id", id);
  await admin.from("accesos").delete().eq("user_id", id);

  // 3. El perfil primero, por separado: si una tabla nueva lo referencia, el
  //    23503 llega con el nombre de la tabla y se puede explicar.
  const { error: errorPerfil } = await admin.from("perfiles").delete().eq("id", id);
  if (errorPerfil) {
    if (errorPerfil.code === "23503") {
      const tabla = /from table "([^"]+)"/.exec(errorPerfil.details ?? "")?.[1];
      const que = tabla ? (NOMBRE_TABLA[tabla] ?? `registros en ${tabla}`) : "registros";
      return { error: `${perfil.nombre} todavía tiene ${que}. Desactívelo en vez de borrarlo.` };
    }
    return { error: errorPerfil.message };
  }

  // 4. El acceso. Si esto falla, el perfil ya no existe y la cuenta queda
  //    huérfana en auth: no puede entrar (el layout exige perfil) y el
  //    correo se libera borrándola desde acá otra vez, así que se avisa.
  const { error: errorAuth } = await admin.auth.admin.deleteUser(id);
  if (errorAuth) {
    return { error: `El usuario se quitó del CRM pero su acceso no se pudo borrar: ${errorAuth.message}` };
  }

  revalidatePath("/admin");
  return { error: null };
}
