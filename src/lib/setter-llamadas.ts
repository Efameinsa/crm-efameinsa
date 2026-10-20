import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarNumero } from "@/lib/llamadas";

/**
 * MODO SETTER (Santos, 20-10-2026): cada lead nuevo con teléfono pone una llamada en
 * la cola de quien está de setter (`perfiles.setter_llamadas`). El celular de esa
 * persona la recoge a los pocos segundos y marca (ver /api/llamadas/por-hacer).
 *
 * Mejor esfuerzo: si esto falla, el lead se registra igual.
 */
export async function encolarLlamadaSetter(l: { leadId: string; nombre: string; telefono: string | null | undefined; detalle?: string | null }) {
  try {
    const numero = normalizarNumero(l.telefono ?? "");
    if (!numero) return;
    const admin = createAdminClient();
    const { data: setters } = await admin.from("perfiles").select("id").eq("setter_llamadas", true).eq("activo", true);
    if (!setters?.length) return;
    const { error } = await admin.from("llamadas_por_hacer").insert(
      setters.map((s) => ({ user_id: s.id as string, lead_id: l.leadId, nombre: l.nombre, telefono: numero, detalle: l.detalle ?? null })),
    );
    if (error) console.error("setter: no se encoló la llamada:", error.message);
  } catch (e) {
    console.error("setter:", e instanceof Error ? e.message : e);
  }
}
