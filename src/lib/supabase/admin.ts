import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
