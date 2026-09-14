import type { createClient } from "@/lib/supabase/server";

// El tipo y las etiquetas de tipificación viven acá, no en
// `acciones/whatsapp-campanas.ts` (un archivo "use server"): ese tipo de
// archivo solo puede exportar funciones async — un `const` como
// ETIQUETA_TIPIFICACION revienta el build ("A 'use server' file can only
// export async functions, found object").
export type TipificacionWhatsapp =
  | "interesado"
  | "cotizado"
  | "no_interesado"
  | "equivocado"
  | "sin_respuesta"
  | "continuado_por_mi_linea";

export const ETIQUETA_TIPIFICACION: Record<TipificacionWhatsapp, string> = {
  interesado: "Interesado",
  cotizado: "Cotizado",
  no_interesado: "No interesado",
  equivocado: "Número equivocado",
  sin_respuesta: "Sin respuesta",
  continuado_por_mi_linea: "Continuado por mi línea",
};

/**
 * El resumen de WhatsApp de campañas por código, para el panel de marketing
 * (fase 1 sin API, 14-09-2026). Volumen chico —cientos de filas, no miles—
 * así que se agrega en JavaScript, sin necesitar una función de Postgres como
 * `leads_por_origen` (esa sí hace falta con ~39k leads históricos).
 */
export interface ResumenCampaniaWhatsapp {
  codigo: string;
  nombre: string;
  plataforma: "meta" | "google" | "otro";
  total: number;
  porEstado: Partial<Record<TipificacionWhatsapp, number>>;
  sinTipificar: number;
}

export async function cargarResumenWhatsapp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  desde: string,
  hasta: string,
): Promise<ResumenCampaniaWhatsapp[]> {
  const [{ data: leads }, { data: campanias }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, codigo_campania_wa")
      .not("codigo_campania_wa", "is", null)
      .gte("recibido_at", desde)
      .lt("recibido_at", `${hasta}T23:59:59`)
      .eq("es_prueba", false),
    supabase.from("campanias_whatsapp").select("codigo, nombre, plataforma"),
  ]);

  const filas = leads ?? [];
  if (filas.length === 0) return [];

  const { data: tipificaciones } = await supabase
    .from("tipificacion_whatsapp_actual")
    .select("lead_id, estado")
    .in(
      "lead_id",
      filas.map((f) => f.id),
    );
  const estadoPorLead = new Map((tipificaciones ?? []).map((t) => [t.lead_id, t.estado as TipificacionWhatsapp]));
  const infoCampania = new Map((campanias ?? []).map((c) => [c.codigo, c]));

  const resumen = new Map<string, ResumenCampaniaWhatsapp>();
  for (const f of filas) {
    const codigo = f.codigo_campania_wa!;
    if (!resumen.has(codigo)) {
      const info = infoCampania.get(codigo);
      resumen.set(codigo, {
        codigo,
        nombre: info?.nombre ?? codigo,
        plataforma: (info?.plataforma as "meta" | "google" | "otro") ?? "otro",
        total: 0,
        porEstado: {},
        sinTipificar: 0,
      });
    }
    const r = resumen.get(codigo)!;
    r.total++;
    const estado = estadoPorLead.get(f.id);
    if (estado) r.porEstado[estado] = (r.porEstado[estado] ?? 0) + 1;
    else r.sinTipificar++;
  }

  return [...resumen.values()].sort((a, b) => b.total - a.total);
}
