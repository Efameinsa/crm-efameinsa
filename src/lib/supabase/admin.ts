import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente con service_role: bypassa RLS. SOLO para webhooks, crons y scripts
// (src/app/api/**, scripts/**). Nunca importar desde código que corre en el cliente
// ni desde Server Components/Actions que atienden una request de usuario.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
