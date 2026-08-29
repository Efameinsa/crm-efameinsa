import type { createClient } from "@/lib/supabase/server";

// Tipos del jsonb que devuelve supervision_diaria() (migración 0040,
// docs/08-plan-supervision-diaria.md). Toda la agregación vive en Postgres.

export interface ComercialSupervision {
  id: string;
  nombre: string;
  codigo: string | null;
  /** Postventa: cuenta como carga de Central, pero no compite en la meta de
   *  seguimientos ni en el ranking de ventas (migraciones 0075 y 0078). */
  es_postventa?: boolean;
  codigo_anterior: string | null;
  seguimientos_efectivos: number;
  intentos_sin_contacto: number;
  /** Gestiones sobre casos de postventa: se muestran, no cuentan para la meta
   *  de venta (migración 0093). */
  gestiones_postventa: number;
  hace_postventa?: boolean;
  cumple_meta: boolean;
  /** La meta de gestiones de ESTA persona (migración 0117). Puede no venir en
   *  respuestas viejas cacheadas; se cae al global. */
  meta_gestiones?: number;
  por_tipo: Record<string, number>;
  /** Cotizaciones hechas en el CRM ese día. */
  cotizaciones: number;
  /** Cotizaciones de ese día que están en el archivo de documentos (previas al CRM). */
  cotizaciones_archivo: number;
  ventas: number;
  monto_vendido_usd: number;
  /** Informes de cierre EMITIDOS ese día (los borradores no cuentan). */
  informes_emitidos: number;
  /** Leads que Central le derivó ese día (migración 0059). Es el numerador
   *  sin el cual "3 cotizaciones" no dice si trabajó bien o mal. */
  derivados: number;
  agenda_pendiente: number;
  agenda_vencida: number;
  primera_gestion: string | null; // "HH:MM:SS" hora Lima
  ultima_gestion: string | null;
}

export interface TotalesSupervision {
  seguimientos_efectivos: number;
  cotizaciones: number;
  cotizaciones_archivo: number;
  /** Documentos de ese día cuya firma no permitió identificar al asesor. */
  cotizaciones_archivo_sin_asesor: number;
  ventas: number;
  informes_emitidos: number;
  derivados: number;
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
