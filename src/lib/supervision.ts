import type { createClient } from "@/lib/supabase/server";

// Tipos del jsonb que devuelve supervision_diaria() (migración 0040,
// docs/08-plan-supervision-diaria.md). Toda la agregación vive en Postgres.

export interface ComercialSupervision {
  id: string;
  nombre: string;
  codigo: string | null;
  codigo_anterior: string | null;
  seguimientos_efectivos: number;
  intentos_sin_contacto: number;
  cumple_meta: boolean;
  por_tipo: Record<string, number>;
  cotizaciones: number;
  ventas: number;
  monto_vendido_usd: number;
  agenda_pendiente: number;
  agenda_vencida: number;
  primera_gestion: string | null; // "HH:MM:SS" hora Lima
  ultima_gestion: string | null;
}

export interface TotalesSupervision {
  seguimientos_efectivos: number;
  cotizaciones: number;
  ventas: number;
  comerciales_en_meta: number;
  comerciales_sin_actividad: number;
}

export interface SupervisionDiaria {
  fecha: string; // YYYY-MM-DD
  meta_seguimientos: number;
  comerciales: ComercialSupervision[];
  totales: TotalesSupervision;
}

export async function cargarSupervisionDiaria(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fecha: string,
): Promise<SupervisionDiaria | null> {
  const { data, error } = await supabase.rpc("supervision_diaria", { p_fecha: fecha });
  if (error) {
    console.error("supervision_diaria:", error.message);
    return null;
  }
  return data as unknown as SupervisionDiaria;
}

/** "09:41:34.927005" -> "09:41". */
export function horaCorta(hora: string | null): string | null {
  return hora ? hora.slice(0, 5) : null;
}
