// PILOTO LOCAL (23-09-2026). Con el CRM corriendo en la VM de la oficina, el
// servidor habla con Supabase por la red interna (SUPABASE_URL_INTERNA) y el
// navegador por el mismo origen por el que entró —la IP de la oficina o el
// túnel—, porque el reverse proxy de la VM reparte /auth, /rest, /realtime y
// /storage a Supabase. La cookie de sesión lleva un nombre fijo para que el
// navegador y el servidor la llamen igual aunque usen URLs distintas.
// Sin esas variables todo se comporta exactamente como en producción.
//
// 29-09: el cliente del servidor se construye con la dirección PÚBLICA y es
// su fetch (`fetchRedInterna`) el que desvía cada pedido a la red interna.
// Antes se construía con la interna y los enlaces firmados de los documentos
// salían como http://127.0.0.1:8000/storage/…, que el navegador no alcanza
// («los documentos no se dejan ver, sale una url con números»; Safari lo
// reportaba como acceso a localhost).
export function urlSupabaseServidor(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

export function fetchRedInterna(base: typeof fetch = fetch): typeof fetch {
  const publica = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const interna = process.env.SUPABASE_URL_INTERNA?.replace(/\/$/, "");
  if (!publica || !interna || typeof window !== "undefined") return base;
  const desviar = (u: string) => (u.startsWith(publica) ? interna + u.slice(publica.length) : u);
  const desviado = (entrada: RequestInfo | URL, init?: RequestInit) => {
    if (typeof entrada === "string") return base(desviar(entrada), init);
    if (entrada instanceof URL) return base(desviar(entrada.toString()), init);
    const nueva = desviar(entrada.url);
    return base(nueva === entrada.url ? entrada : new Request(nueva, entrada), init);
  };
  return desviado as typeof fetch;
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
