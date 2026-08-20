import type { createClient } from "@/lib/supabase/server";

// Tipos del jsonb de finanzas_marketing() (migración 0042). Toda la
// agregación vive en Postgres; acá solo se tipa y se formatea.

export interface ResultadoPeriodo {
  ventas_usd: number;
  n_ventas: number;
  costo_ventas_usd: number;
  utilidad_bruta_usd: number;
  inversion_publicitaria_usd: number;
  utilidad_despues_mkt_usd: number;
  ticket_promedio_usd: number;
}

export interface MesFinanzas {
  mes: string; // YYYY-MM
  ventas_usd: number;
  n_ventas: number;
  utilidad_bruta_usd: number;
  gasto_ads_usd: number;
  utilidad_despues_mkt_usd: number;
}

export type GrupoAtribucion = "publicidad" | "relacion" | "sin_atribucion" | "otro";

export interface FinanzasMarketing {
  desde: string;
  hasta: string;
  tc_usd_pen: number;
  margen_pct: number;
  resultado: ResultadoPeriodo;
  meses: MesFinanzas[];
  atribucion: {
    por_via: { via: string; grupo: GrupoAtribucion; n: number; monto_usd: number }[];
    por_grupo: Partial<Record<GrupoAtribucion, { n: number; monto_usd: number }>>;
  };
  recurrencia: { recurrentes_usd: number; nuevos_usd: number; n_recurrentes: number; n_nuevos: number };
  cltv: {
    clientes: number;
    promedio_usd: number;
    mediana_usd: number;
    q1_usd: number;
    q3_usd: number;
    p90_usd: number;
    minimo_usd: number;
    maximo_usd: number;
    total_usd: number;
    con_2_o_mas: number;
    compras_promedio: number;
    histograma: { tramo: string; desde: number; hasta: number; clientes: number }[];
    deciles: {
      decil: number;
      clientes: number;
      monto_usd: number;
      desde_usd: number;
      hasta_usd: number;
      /** Los mayores del decil (hasta 25), para desplegar al hacer clic. */
      muestra: { cuenta_id: string; razon_social: string; total_usd: number; compras: number }[];
    }[];
  };
  top_clientes: { cuenta_id: string; razon_social: string; compras: number; total_usd: number }[];
}

export async function cargarFinanzasMarketing(
  supabase: Awaited<ReturnType<typeof createClient>>,
  periodo: { desde: string; hasta: string },
): Promise<FinanzasMarketing | null> {
  const { data, error } = await supabase.rpc("finanzas_marketing", {
    p_desde: periodo.desde,
    p_hasta: periodo.hasta,
  });
  if (error) {
    console.error("finanzas_marketing:", error.message);
    return null;
  }
  return data as unknown as FinanzasMarketing;
}

export const ETIQUETA_GRUPO: Record<GrupoAtribucion, string> = {
  publicidad: "Publicidad digital",
  relacion: "Relación y cartera",
  sin_atribucion: "Sin atribución clara",
  otro: "Otros",
};

export const AYUDA_GRUPO: Record<GrupoAtribucion, string> = {
  publicidad: "Google Ads, Meta Ads, Facebook y campañas declaradas por el comercial.",
  relacion: "Referidos, cartera propia, visita en ruta, punto de venta y contactos directos.",
  sin_atribucion: "Ventas marcadas como “página web”, que era el valor por defecto de la hoja histórica: mezcla tráfico orgánico con publicidad sin distinguir.",
  otro: "Vías que no encajan en las categorías anteriores.",
};

/** Variación porcentual contra el mes anterior. null si no hay con qué comparar. */
export function variacion(actual: number, previo: number | undefined): number | null {
  if (previo === undefined || previo === 0) return null;
  return ((actual - previo) / Math.abs(previo)) * 100;
}
