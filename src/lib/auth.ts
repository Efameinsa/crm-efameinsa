import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Perfil, RolUsuario } from "@/types/database";

const RUTA_POR_ROL: Record<RolUsuario, string> = {
  admin: "/admin",
  gerencia: "/gerencia",
  central: "/central",
  comercial: "/comercial",
};

// Server Component / Server Action helper: perfil del usuario autenticado.
// Redirige a /login si no hay sesión — el middleware ya debería haberlo evitado,
// esta es la segunda barrera (defensa en profundidad, no confiar solo en el middleware).
// cache() deduplica la consulta si varios layouts/componentes la piden en la misma request.
export const requerirPerfil = cache(async (): Promise<Perfil> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!perfil) redirect("/login");

  return perfil as Perfil;
});

// Para layouts de sección (central/comercial/gerencia/admin): si el rol no
// coincide, manda al usuario a SU home en vez de mostrar la sección ajena.
// El middleware solo protege "/" y "/login" — esta es la barrera por sección.
export async function requerirRol(rolesPermitidos: RolUsuario[]): Promise<Perfil> {
  const perfil = await requerirPerfil();
  if (!rolesPermitidos.includes(perfil.rol)) {
    redirect(RUTA_POR_ROL[perfil.rol]);
  }
  return perfil;
}
