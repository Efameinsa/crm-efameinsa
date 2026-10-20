import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarNumero } from "@/lib/llamadas";

/**
 * MODO SETTER (Santos, 20-10-2026): cada lead nuevo con teléfono pone una llamada en
 * la cola de quien está de setter (`perfiles.setter_llamadas`). El celular de esa
 * persona la recoge a los pocos segundos y marca (ver /api/llamadas/por-hacer).
 *
 * Mientras el celular del setter esté en línea, el lead NO se reparte al comercial al
 * llegar: espera la llamada y la tipificación (`setter-tipificacion.ts`). Si el celular
 * está apagado, o el setter no tipifica a tiempo, el lead se reparte igual.
 *
 * Mejor esfuerzo: si esto falla, el lead se registra igual.
 */

/** El celular preguntó por llamadas hace menos de esto: está «en línea» y puede atender el lead. */
const EN_LINEA_MS = 90_000;

/** ¿Hay un celular de setter encendido y conectado ahora mismo? */
export async function setterEnLinea(): Promise<boolean> {
  try {
    const { data } = await createAdminClient()
      .from("perfiles")
      .select("id")
      .eq("setter_llamadas", true)
      .eq("activo", true)
      .gte("setter_visto_at", new Date(Date.now() - EN_LINEA_MS).toISOString())
      .limit(1);
    return Boolean(data?.length);
  } catch {
    return false;
  }
}

export async function encolarLlamadaSetter(l: {
  leadId: string;
  nombre: string;
  telefono: string | null | undefined;
  detalle?: string | null;
  retiene?: boolean;
}) {
  try {
    const numero = normalizarNumero(l.telefono ?? "");
    if (!numero) return;
    const admin = createAdminClient();
    const { data: setters } = await admin.from("perfiles").select("id").eq("setter_llamadas", true).eq("activo", true);
    if (!setters?.length) return;
    const { error } = await admin.from("llamadas_por_hacer").insert(
      setters.map((s) => ({
        user_id: s.id as string,
        lead_id: l.leadId,
        nombre: l.nombre,
        telefono: numero,
        detalle: l.detalle ?? null,
        retiene: Boolean(l.retiene),
      })),
    );
    if (error) console.error("setter: no se encoló la llamada:", error.message);
  } catch (e) {
    console.error("setter:", e instanceof Error ? e.message : e);
  }
}

/** Cuánto esperamos, desde que el setter colgó, a que tipifique antes de repartir el lead por nuestra cuenta. */
const ESPERA_TIPIFICAR_MS = 45 * 60_000;
/** Si el celular recibió el aviso y no dijo nada más (se apagó, se cerró la app), se espera esto. */
const ESPERA_AVISADA_MS = 10 * 60_000;

/**
 * RED DE SEGURIDAD: un lead que el setter tenía y no tipificó no puede quedar trabado.
 * Se reparte como siempre (al dueño de la campaña o a Central) cuando:
 *  · el setter canceló o la llamada se descartó (celular apagado más de 30 minutos);
 *  · llamó y pasaron 45 minutos sin tipificar;
 *  · el aviso llegó al celular y 10 minutos después nadie contestó.
 * Se llama desde el registro de cada lead nuevo, desde el sondeo del celular y desde Central.
 */
export async function liberarLeadsSinTipificar(): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data: filas } = await admin
      .from("llamadas_por_hacer")
      .select("id, lead_id, estado, avisada_at, cerrada_at, disponible_desde, tipificada_at, creada_at")
      .eq("retiene", true)
      .is("tipificada_at", null)
      .not("lead_id", "is", null)
      .neq("estado", "pendiente")
      .order("creada_at", { ascending: false })
      .limit(100);
    if (!filas?.length) return 0;
    const ahora = Date.now();
    const vistos = new Set<string>();
    let repartidos = 0;
    for (const f of filas) {
      const leadId = f.lead_id as string;
      if (vistos.has(leadId)) continue;
      vistos.add(leadId);
      // Si el lead tiene otro intento en cola (reintento futuro), sigue esperando.
      const { data: vivos } = await admin
        .from("llamadas_por_hacer")
        .select("id")
        .eq("lead_id", leadId)
        .eq("retiene", true)
        .in("estado", ["pendiente"])
        .limit(1);
      if (vivos?.length) continue;
      const desde = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
      const vencido =
        f.estado === "descartada" ||
        (f.estado === "llamada" && ahora - desde(f.cerrada_at as string | null) > ESPERA_TIPIFICAR_MS) ||
        (f.estado === "avisada" && ahora - desde(f.avisada_at as string | null) > ESPERA_AVISADA_MS);
      if (!vencido) continue;
      const { entregarLeadDelSetter, reclamar } = await import("@/lib/setter-tipificacion");
      // Solo quien logra «reclamar» el lead lo reparte: dos sondeos a la vez no lo hacen dos veces.
      if (!(await reclamar(leadId))) continue;
      await entregarLeadDelSetter(leadId, { resultado: null, nota: "El setter no llegó a tipificarlo: se repartió solo.", reclamar: false });
      repartidos++;
    }
    return repartidos;
  } catch (e) {
    console.error("setter: liberar leads:", e instanceof Error ? e.message : e);
    return 0;
  }
}
