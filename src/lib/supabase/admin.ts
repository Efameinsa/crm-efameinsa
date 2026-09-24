import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { CABECERA_DEMO, fetchSoloLectura } from "@/lib/solo-lectura";

// `next/headers` solo existe en el servidor. Este archivo llega al navegador
// por whatsapp-hilo.tsx → lib/whatsapp.ts (donde nunca se llama), y un
// import fijo rompe la compilación de Vercel (Turbopack). Se carga por nombre
// y en el momento, así el empaquetador del navegador no lo toca.
async function cabeceraDemo(): Promise<boolean> {
  try {
    const especificador = "next/headers";
    const { headers } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ especificador)) as typeof import("next/headers");
    return Boolean((await headers()).get(CABECERA_DEMO));
  } catch {
    // Fuera de una petición (cron, scripts, navegador): no hay demostración posible.
    return false;
  }
}

// Durante una petición de una cuenta de demostración (0280), el cliente con
// service_role tampoco escribe: una acción que avisa por la campana o registra
// algo con este cliente no debe dejar rastro de la demostración.
const soloLectura = fetchSoloLectura();
async function fetchSegunPeticion(entrada: RequestInfo | URL, init?: RequestInit) {
  return (await cabeceraDemo()) ? soloLectura(entrada, init) : fetch(entrada, init);
}

// Cliente con service_role: bypassa RLS. SOLO para webhooks, crons y scripts
// (src/app/api/**, scripts/**). Nunca importar desde código que corre en el cliente
// ni desde Server Components/Actions que atienden una request de usuario.
//
// ÚNICA EXCEPCIÓN, y está acotada: `crearUsuario` y `borrarUsuario` en
// src/lib/acciones/usuarios.ts. Dar de alta o de baja una cuenta en Supabase
// Auth no se puede de otra forma, así que ahí se usa después de comprobar con
// requerirRol(["admin"]) quién está ejecutando. Todo lo demás de esa pantalla
// (cambiar rol, código o estado) va por el cliente normal, para que siga
// mandando la política `perfiles_admin` de la base.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: fetchSegunPeticion } },
  );
}
