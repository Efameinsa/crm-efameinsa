import type { createClient } from "@/lib/supabase/server";

export interface FilaGastoCruda {
  fecha: string;
  gasto: number;
  impresiones: number;
  clics: number;
  leads_reportados: number;
  moneda: string;
  campanias: { id: string; campaign_id: string; nombre: string; plataforma: string } | null;
}

export interface TotalesPorMoneda {
  moneda: string;
  gasto: number;
  impresiones: number;
  clics: number;
  leadsReportados: number;
  ctr: number; // %
  cpc: number;
  cpl: number;
}

export interface PuntoSerie {
  etiqueta: string; // dd/mm o mmm-yy según granularidad
  fecha: string; // clave de orden, ISO
  gasto: number;
}

export interface FilaCampania {
  id: string;
  nombre: string;
  plataforma: string;
  moneda: string;
  gasto: number;
  impresiones: number;
  clics: number;
  leadsReportados: number;
  ctr: number;
  cpl: number;
}

export interface ResumenMarketing {
  filas: FilaGastoCruda[];
  totalesPorMoneda: TotalesPorMoneda[];
  serie: PuntoSerie[];
  granularidad: "dia" | "mes";
  porCampania: FilaCampania[];
}

function diasEntre(desde: string, hasta: string): number {
  const ms = new Date(hasta).getTime() - new Date(desde).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

// Trae el gasto de campañas en el rango [desde, hasta] (inclusive) y arma los
// agregados que necesita el panel de gerencia: totales por moneda (nunca se
// suma gasto de monedas distintas entre sí), la serie para el gráfico
// (diaria si el rango es corto, mensual si es largo — un año en barras
// diarias sería ilegible) y el desglose por campaña.
export async function cargarResumenMarketing(
  supabase: Awaited<ReturnType<typeof createClient>>,
  { desde, hasta, plataforma }: { desde: string; hasta: string; plataforma?: "google" | "meta" },
): Promise<ResumenMarketing> {
  let query = supabase
    .from("gasto_campania")
    .select("fecha, gasto, impresiones, clics, leads_reportados, moneda, campanias!inner(id, campaign_id, nombre, plataforma)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });

  if (plataforma) {
    query = query.eq("campanias.plataforma", plataforma);
  }

  const { data } = await query;
  const filas = ((data ?? []) as unknown as FilaGastoCruda[]).map((f) => ({
    ...f,
    campanias: f.campanias as unknown as FilaGastoCruda["campanias"],
  }));

  // Totales por moneda.
  const acumPorMoneda = new Map<string, TotalesPorMoneda>();
  for (const f of filas) {
    const actual = acumPorMoneda.get(f.moneda) ?? {
      moneda: f.moneda,
      gasto: 0,
      impresiones: 0,
      clics: 0,
      leadsReportados: 0,
      ctr: 0,
      cpc: 0,
      cpl: 0,
    };
    actual.gasto += f.gasto;
    actual.impresiones += f.impresiones;
    actual.clics += f.clics;
    actual.leadsReportados += f.leads_reportados;
    acumPorMoneda.set(f.moneda, actual);
  }
  const totalesPorMoneda = Array.from(acumPorMoneda.values()).map((t) => ({
    ...t,
    ctr: t.impresiones > 0 ? (t.clics / t.impresiones) * 100 : 0,
    cpc: t.clics > 0 ? t.gasto / t.clics : 0,
    cpl: t.leadsReportados > 0 ? t.gasto / t.leadsReportados : 0,
  }));

  // Serie temporal: diaria si el rango es corto, mensual si es largo.
  const granularidad: "dia" | "mes" = diasEntre(desde, hasta) > 45 ? "mes" : "dia";
  const acumSerie = new Map<string, number>();
  for (const f of filas) {
    const clave = granularidad === "mes" ? f.fecha.slice(0, 7) : f.fecha; // YYYY-MM o YYYY-MM-DD
    acumSerie.set(clave, (acumSerie.get(clave) ?? 0) + f.gasto);
  }
  const serie: PuntoSerie[] = Array.from(acumSerie.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, gasto]) => ({
      fecha: clave,
      gasto,
      etiqueta:
        granularidad === "mes"
          ? new Date(`${clave}-01T00:00:00`).toLocaleDateString("es-PE", { month: "short", year: "2-digit" })
          : new Date(`${clave}T00:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" }),
    }));

  // Desglose por campaña.
  const acumCampania = new Map<string, FilaCampania>();
  for (const f of filas) {
    if (!f.campanias) continue;
    const actual = acumCampania.get(f.campanias.id) ?? {
      id: f.campanias.id,
      nombre: f.campanias.nombre,
      plataforma: f.campanias.plataforma,
      moneda: f.moneda,
      gasto: 0,
      impresiones: 0,
      clics: 0,
      leadsReportados: 0,
      ctr: 0,
      cpl: 0,
    };
    actual.gasto += f.gasto;
    actual.impresiones += f.impresiones;
    actual.clics += f.clics;
    actual.leadsReportados += f.leads_reportados;
    acumCampania.set(f.campanias.id, actual);
  }
  const porCampania = Array.from(acumCampania.values())
    .map((c) => ({
      ...c,
      ctr: c.impresiones > 0 ? (c.clics / c.impresiones) * 100 : 0,
      cpl: c.leadsReportados > 0 ? c.gasto / c.leadsReportados : 0,
    }))
    .sort((a, b) => b.gasto - a.gasto);

  return { filas, totalesPorMoneda, serie, granularidad, porCampania };
}
