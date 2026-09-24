// PILOTO LOCAL (23-09-2026). Con el CRM corriendo en la VM de la oficina, el
// servidor habla con Supabase por la red interna (SUPABASE_URL_INTERNA) y el
// navegador por el mismo origen por el que entró —la IP de la oficina o el
// túnel—, porque el reverse proxy de la VM reparte /auth, /rest, /realtime y
// /storage a Supabase. La cookie de sesión lleva un nombre fijo para que el
// navegador y el servidor la llamen igual aunque usen URLs distintas.
// Sin esas variables todo se comporta exactamente como en producción.
export function urlSupabaseServidor(): string {
  return process.env.SUPABASE_URL_INTERNA ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

export function urlSupabaseNavegador(): string {
  if (process.env.NEXT_PUBLIC_SUPABASE_MISMO_ORIGEN === "1" && typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

export const opcionesCookieSupabase = process.env.NEXT_PUBLIC_SUPABASE_COOKIE
  ? { name: process.env.NEXT_PUBLIC_SUPABASE_COOKIE }
  : undefined;
