"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const esquemaLogin = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export async function iniciarSesion(
  _prevState: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const datos = esquemaLogin.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!datos.success) {
    return { error: datos.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(datos.data);

  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }

  // Regla de gerencia: registrar quién entra y desde dónde (R10).
  const encabezados = await headers();
  const ip =
    encabezados.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    encabezados.get("x-real-ip") ??
    null;
  const userAgent = encabezados.get("user-agent");

  await supabase.from("accesos").insert({
    user_id: data.user.id,
    ip,
    user_agent: userAgent,
  });

  redirect("/");
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Cambiar la propia contraseña. Hace falta porque el alta de usuarios entrega
// una clave temporal: repartir claves sin una forma de cambiarlas es dejar la
// puerta abierta.
//
// Se vuelve a pedir la actual y se comprueba iniciando sesión con ella antes
// de cambiar nada: `updateUser` no la verifica por su cuenta, así que sin este
// paso bastaría con una sesión abierta —un equipo que quedó desbloqueado— para
// quedarse con la cuenta de otro.
export async function cambiarMiClave(formData: FormData): Promise<{ error: string | null }> {
  const actual = String(formData.get("actual") ?? "");
  const nueva = String(formData.get("nueva") ?? "");
  if (nueva.length < 8) return { error: "La nueva contraseña debe tener al menos 8 caracteres" };
  if (nueva === actual) return { error: "La nueva contraseña tiene que ser distinta de la actual" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Sesión expirada" };

  const { error: errorActual } = await supabase.auth.signInWithPassword({ email: user.email, password: actual });
  if (errorActual) return { error: "La contraseña actual no es correcta" };

  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) return { error: error.message };

  return { error: null };
}
