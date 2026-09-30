import type { createClient } from "@/lib/supabase/server";
import { WHATSAPP_CUENTA_PARA_META, marcasWhatsappDelDia } from "@/lib/gestion-whatsapp";

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
  /** Marcas de WhatsApp de un botón ese día (gestion-whatsapp.ts): van en su
   *  propia barra. Las agrega cargarSupervisionDiaria, no la función SQL. */
  gestion_whatsapp?: number;
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
  const sup = data as unknown as SupervisionDiaria;
  // La gestión de WhatsApp, aparte (23-09); y fuera de la meta desde el 30-09.
  const marcas = await marcasWhatsappDelDia(supabase, sup.fecha ?? fecha, sup.comerciales.map((c) => c.id));
  if (!WHATSAPP_CUENTA_PARA_META) {
    let quitadas = 0;
    for (const c of sup.comerciales) {
      const m = marcas.get(c.id) ?? { total: 0, enVenta: 0 };
      c.gestion_whatsapp = m.total;
      if (m.total === 0) continue;
      // Las marcas no llevan resultado («no contestó» no existe en un botón):
      // la función SQL las contó TODAS como efectivas, las de venta en el
      // número grande y las de postventa en «Postventa N». Se restan de donde
      // cayeron y de su chip, para que el número y los chips sigan cuadrando
      // (el reclamo del gerente del 25-08).
      c.seguimientos_efectivos = Math.max(0, c.seguimientos_efectivos - m.enVenta);
      c.gestiones_postventa = Math.max(0, c.gestiones_postventa - (m.total - m.enVenta));
      if (c.por_tipo.whatsapp !== undefined) {
        const resto = c.por_tipo.whatsapp - m.total;
        if (resto > 0) c.por_tipo.whatsapp = resto;
        else delete c.por_tipo.whatsapp;
      }
      const cumplia = c.cumple_meta;
      c.cumple_meta = c.seguimientos_efectivos >= (c.meta_gestiones ?? sup.meta_seguimientos);
      if (cumplia && !c.cumple_meta) sup.totales.comerciales_en_meta = Math.max(0, sup.totales.comerciales_en_meta - 1);
      quitadas += m.enVenta;
    }
    sup.totales.seguimientos_efectivos = Math.max(0, sup.totales.seguimientos_efectivos - quitadas);
  } else {
    for (const c of sup.comerciales) c.gestion_whatsapp = marcas.get(c.id)?.total ?? 0;
  }
  return sup;
}

/** "09:41:34.927005" -> "09:41". */
export function horaCorta(hora: string | null): string | null {
  return hora ? hora.slice(0, 5) : null;
}
