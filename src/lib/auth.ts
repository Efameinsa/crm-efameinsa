import { cache } from "react";
import { redirect } from "next/navigation";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createClient } from "@/lib/supabase/server";
import type { Perfil, RolUsuario } from "@/types/database";

// LA SESIÓN SE VERIFICA ACÁ MISMO, SIN VIAJAR (Santos, 02-09, «pequeños
// tirones»). Hasta hoy cada navegación validaba la sesión dos veces contra
// Supabase Auth por la red: en el proxy y otra vez en el layout (~130 ms
// cada una). El proyecto firma los tokens con ES256, así que la firma se
// comprueba localmente con la clave pública, que se descarga una vez y queda
// en memoria mientras la función esté caliente. Si el token está vencido o no
// se puede comprobar, se cae al camino de siempre (getUser por la red).
const JWKS = createRemoteJWKSet(new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
const EMISOR = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;

async function usuarioDeLaSesion(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWKS, { issuer: EMISOR });
      if (typeof payload.sub === "string") return payload.sub;
    } catch {
      // vencido, firmado con otra clave o corrupto: se valida por la red
    }
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const RUTA_POR_ROL: Record<RolUsuario, string> = {
  admin: "/admin",
  gerencia: "/gerencia",
  central: "/central",
  comercial: "/comercial",
  operaciones: "/operaciones",
};

// Server Component / Server Action helper: perfil del usuario autenticado.
// Redirige a /login si no hay sesión — el middleware ya debería haberlo evitado,
// esta es la segunda barrera (defensa en profundidad, no confiar solo en el middleware).
// cache() deduplica la consulta si varios layouts/componentes la piden en la misma request.
export const requerirPerfil = cache(async (): Promise<Perfil> => {
  const supabase = await createClient();
  const userId = await usuarioDeLaSesion(supabase);

  if (!userId) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", userId)
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
