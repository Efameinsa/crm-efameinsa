import type { createClient } from "@/lib/supabase/server";

// Tipos del jsonb que devuelven resumen_gerencia() y listar_clientes()
// (migraciones 0020/0021). Toda la agregación vive en Postgres: acá solo se
// tipa y se pasa a la UI. Nunca traer filas crudas al servidor para contar
// — supabase-js corta en 1.000 filas sin avisar.

export interface KpisGerencia {
  tc_usd_pen: number;
  meses_periodo: number;
  ventas_usd: number;
  ventas_pen: number;
  ventas_usd_equiv: number;
  n_ventas: number;
  ticket_promedio_usd: number;
  pipeline_usd: number;
  n_abiertas: number;
  op_creadas: number;
  op_ganadas: number;
  op_rechazadas: number;
  leads_recibidos: number;
  leads_publicidad: number;
  leads_sin_asignar: number;
  cot_por_aprobar: number;
  cot_enviadas: number;
  clientes_con_venta: number;
  clientes_nuevos: number;
  clientes_recurrentes: number;
  monto_recurrentes_usd: number;
  monto_nuevos_usd: number;
  cltv_promedio_usd: number;
  cltv_recurrentes_usd: number;
  clientes_historicos: number;
  clientes_recurrentes_historicos: number;
  frecuencia_promedio: number;
}

export interface PuntoMensual {
  mes: string; // YYYY-MM
  ventas_usd: number;
  n_ventas: number;
}

export interface FilaComercialResumen {
  id: string;
  nombre: string;
  codigo: string | null;
  meta_mensual: number | null;
  meta_periodo: number;
  ventas_usd: number;
  n_ventas: number;
  clientes: number;
  op_creadas: number;
  op_abiertas: number;
  op_ganadas: number;
  op_rechazadas: number;
  pipeline_usd: number;
  cot_enviadas: number;
  cotizado_usd: number;
}

export interface ViaAdquisicion {
  via: string; // 'google_ads' | 'meta_ads' | 'contacto_<canal>' | 'cartera' | 'historico_excel'
  n: number;
  monto_usd: number;
}

export interface TopCliente {
  cuenta_id: string;
  razon_social: string;
  n: number;
  monto_usd: number;
  comercial: string;
}

export interface CalidadDatos {
  ventas_historicas_sin_monto: number;
  ventas_sin_serie: number;
  cuentas_sin_documento: number;
  ventas_historicas_total: number;
  ventas_crm_total: number;
  primer_lead_publicidad: string | null;
}

export interface ResumenGerencia {
  kpis: KpisGerencia;
  serie_mensual: PuntoMensual[];
  embudo: Record<string, number>;
  por_comercial: FilaComercialResumen[];
  via_adquisicion: ViaAdquisicion[];
  top_clientes: TopCliente[];
  calidad_datos: CalidadDatos;
}

export const ETIQUETA_VIA: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  cartera: "Cartera propia (sin lead)",
  historico_excel: "Histórico Excel",
  contacto_whatsapp: "WhatsApp entrante",
  contacto_llamada: "Llamada entrante",
  contacto_formulario_web: "Formulario web",
  contacto_facebook: "Facebook",
  contacto_instagram: "Instagram",
  contacto_email: "Correo",
  contacto_presencial: "Presencial",
  contacto_referido: "Referido",
  contacto_otro: "Otro contacto",
};

export async function cargarResumenGerencia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opciones: { desde: string; hasta: string; comercialId?: string | null; incluirHistorico?: boolean },
): Promise<ResumenGerencia | null> {
  const { data, error } = await supabase.rpc("resumen_gerencia", {
    p_desde: opciones.desde,
    p_hasta: opciones.hasta,
    p_comercial: opciones.comercialId ?? null,
    p_incluir_historico: opciones.incluirHistorico ?? true,
  });
  if (error) {
    console.error("resumen_gerencia:", error.message);
    return null;
  }
  return data as unknown as ResumenGerencia;
}

export interface FilaClienteListado {
  id: string;
  razon_social: string;
  tipo_doc: string;
  num_doc: string | null;
  distrito: string | null;
  departamento: string | null;
  comercial_id: string | null;
  ultima_venta_at: string | null;
  created_at: string;
  comercial_nombre: string | null;
  codigo_comercial: string | null;
  abiertas: number;
  n_ventas: number;
  total_usd: number;
}

export type OrdenClientes = "recientes" | "nombre" | "ultima_venta" | "valor";

export async function listarClientes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opciones: {
    q?: string;
    comercialId?: string | null;
    soloConVenta?: boolean;
    soloSinDoc?: boolean;
    orden?: OrdenClientes;
    limite?: number;
    offset?: number;
  },
): Promise<{ total: number; filas: FilaClienteListado[] }> {
  const { data, error } = await supabase.rpc("listar_clientes", {
    p_q: opciones.q ?? null,
    p_comercial: opciones.comercialId ?? null,
    p_solo_con_venta: opciones.soloConVenta ?? false,
    p_solo_sin_doc: opciones.soloSinDoc ?? false,
    p_orden: opciones.orden ?? "recientes",
    p_limite: opciones.limite ?? 50,
    p_offset: opciones.offset ?? 0,
  });
  if (error) {
    console.error("listar_clientes:", error.message);
    return { total: 0, filas: [] };
  }
  return data as unknown as { total: number; filas: FilaClienteListado[] };
}

/** USD con separador peruano, sin decimales (para KPIs). */
export function usd(n: number): string {
  return `US$ ${Math.round(n).toLocaleString("es-PE")}`;
}
export function pct(n: number): string {
  return `${Math.round(n)}%`;
}
