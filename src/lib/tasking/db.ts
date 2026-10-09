import { createAdminClient } from "@/lib/supabase/admin";

// TASKING vive en tablas propias del CRM con prefijo `tasking_` (0426). El código
// viene del proyecto libre soyhank/tasking, que las llama sin prefijo: este
// envoltorio traduce el nombre y deja el resto igual (from, rpc, storage).
//
// Usa la llave de servicio. Solo lo llaman las rutas /api/tasking/** (que antes
// comprueban que sea el admin, el programa de WhatsApp o el cron) y las
// pantallas /tasking/**, cuyo layout ya exige rol admin.
export function db() {
  const c = createAdminClient();
  return {
    from: (tabla: string) => c.from(`tasking_${tabla}`),
    rpc: (fn: string, args?: Record<string, unknown>) => c.rpc(`tasking_${fn}`, args),
    storage: c.storage,
  };
}

export const BUCKET_AUDIO = "tasking-audio";

/** Dirección pública del CRM (para los enlaces que van en WhatsApp y correo). */
export function appUrl() {
  return (process.env.APP_URL || "https://crm.efameinsa.com").replace(/\/$/, "");
}
