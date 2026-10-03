import { createBrowserClient } from "@supabase/ssr";
import { COOKIE_DEMO, fetchSoloLectura } from "@/lib/solo-lectura";
import { opcionesCookieSupabase, urlSupabaseNavegador } from "@/lib/supabase/urls";

export function createClient() {
  // Cuenta de demostración (0280): desde el navegador tampoco se sube ni se
  // escribe nada. La cookie la pone el proxy.
  const demo = typeof document !== "undefined" && document.cookie.split("; ").includes(`${COOKIE_DEMO}=1`);
  return createBrowserClient(
    urlSupabaseNavegador(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: opcionesCookieSupabase, ...(demo ? { global: { fetch: fetchSoloLectura() } } : {}) },
  );
}
