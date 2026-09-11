import type { createClient } from "@/lib/supabase/server";

/**
 * Los contactos que vinieron de campaña y qué pasó con ellos en el CRM
 * (`conversiones_de_campana`, 0226). Lo comparten el panel de marketing —que
 * cuenta por estado— y el CSV que se sube a Google Ads y a Meta.
 */
export interface ConversionDeCampana {
  lead_id: string;
  codigo: string | null;
  recibido_at: string;
  plataforma: "google" | "meta" | "otra";
  gclid: string | null;
  fbclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  fuente: string | null;
  nombre: string | null;
  razon_social: string | null;
  email: string | null;
  telefono: string | null;
  comercial: string | null;
  estado: "nuevo" | "repetido" | "descartado" | "calificado" | "cotizado" | "ganado";
  detalle: string | null;
  valor: number | null;
  moneda: string | null;
  fecha_estado: string;
}

export const ETIQUETA_ESTADO_CONVERSION: Record<ConversionDeCampana["estado"], string> = {
  nuevo: "En la bandeja",
  repetido: "Ya era cliente",
  descartado: "Descartado",
  calificado: "Calificado",
  cotizado: "Cotizado",
  ganado: "Ganado",
};

export async function cargarConversionesDeCampana(
  supabase: Awaited<ReturnType<typeof createClient>>,
  desde: string,
  hasta: string,
): Promise<{ filas: ConversionDeCampana[]; error: string | null }> {
  // PostgREST corta en 1.000 filas sin avisar: se pide por tandas.
  const filas: ConversionDeCampana[] = [];
  for (let desdeFila = 0; ; desdeFila += 1000) {
    const { data, error } = await supabase
      .rpc("conversiones_de_campana", { p_desde: desde, p_hasta: hasta })
      .range(desdeFila, desdeFila + 999);
    if (error) return { filas: [], error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
    const tanda = (data ?? []) as ConversionDeCampana[];
    filas.push(...tanda);
    if (tanda.length < 1000) break;
  }
  return { filas, error: null };
}
