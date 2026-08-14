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
