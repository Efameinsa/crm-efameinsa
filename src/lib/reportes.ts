import type { createClient } from "@/lib/supabase/server";
import { SEMANAS_POR_MES, esSemanal, type PresetPeriodo } from "@/lib/periodo";

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
  // Ventas del período que vienen del histórico Excel: nacieron cerradas,
  // no pasaron por el embudo (que solo cuenta lo gestionado en el CRM).
  ventas_historicas_periodo: number;
  leads_recibidos: number;
  leads_publicidad: number;
  leads_sin_asignar: number;
  cot_por_aprobar: number;
  cot_creadas: number;
  cot_enviadas: number;
  // Presupuestos del histórico Excel en el período. Es un PISO, no el total:
  // solo se conocen los que terminaron en venta (se importaron las ventas,
  // no las hojas de cotización completas). Existe para que "11 cotizaciones"
  // no se lea como toda la actividad del año cuando al lado hay 112 ventas.
  cot_historicas_periodo: number;
  clientes_con_venta: number;
  clientes_nuevos: number;
  clientes_recurrentes: number;
  monto_recurrentes_usd: number;
  monto_nuevos_usd: number;
  cltv_promedio_usd: number;
  cltv_recurrentes_usd: number;
  clientes_historicos: number;
  clientes_recurrentes_historicos: number;
  // Ventas del período por razón social (pedido de Carlos 19-08: la
  // proyección de importaciones y la cobranza se hacen por empresa).
  // sin_serie = históricas del Excel sin razón social registrada.
  ventas_serie: {
    efameinsa_usd: number;
    open_usd: number;
    sin_serie_usd: number;
    n_efameinsa: number;
    n_open: number;
    n_sin_serie: number;
  };
  frecuencia_promedio: number;
}

export interface PuntoMensual {
  mes: string; // YYYY-MM
  ventas_usd: number;
  n_ventas: number;
  efameinsa_usd: number;
  open_usd: number;
  sin_serie_usd: number;
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
  cot_creadas: number;
  cot_enviadas: number;
  cotizado_usd: number;
  cot_historicas: number; // presupuestos del histórico Excel (solo los que vendieron)
  // Ventas del período sin fila en `ventas` (la hoja histórica no traía
  // monto): cuentan como venta real pero no suman dinero — se muestran para
  // que "0 vendido" no se lea como "0 ventas" (caso C8, reunión 19-08).
  ventas_sin_monto: number;
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

// Vías de adquisición: las primeras salen del lead real del CRM (atribución
// exacta por campaña); las demás de la procedencia que declaró el comercial
// en su hoja histórica (PROV_PROSP, migración 0022) — menos exacta pero es
// lo que la empresa registró durante años.
export const ETIQUETA_VIA: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads / campaña FB",
  facebook: "Facebook (orgánico o pauta)",
  publicidad: "Campaña (sin plataforma)",
  web: "Página web (declarado)",
  referido: "Referido por cliente/prospecto",
  visita_ruta: "Visita en ruta",
  punto_venta: "Punto de venta",
  email_marketing: "Emailing",
  linkedin: "LinkedIn",
  olx: "OLX",
  canal2: "Canal 2",
  sin_procedencia: "Histórico sin procedencia",
  otro: "Otra procedencia",
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

/**
 * `preset` no cambia la consulta —el rango ya la acota— pero sí cómo se lee la
 * META. `resumen_gerencia()` la calcula como meta_mensual × meses del rango,
 * con un piso de 1 mes: pedirle una semana devolvía la meta del mes entero, y
 * el velocímetro del comercial marcaba 20% un viernes en que había cumplido.
 * Cuando el período es una semana, la meta se reparte acá.
 */
export async function cargarResumenGerencia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opciones: {
    desde: string;
    hasta: string;
    comercialId?: string | null;
    incluirHistorico?: boolean;
    preset?: PresetPeriodo | null;
  },
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
  const resumen = data as unknown as ResumenGerencia;
  if (esSemanal(opciones.preset)) {
    for (const c of resumen.por_comercial ?? []) {
      c.meta_periodo = Math.round(c.meta_periodo / SEMANAS_POR_MES);
    }
  }
  return resumen;
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
  /** Tiene carpeta del servidor vinculada (0137): la lista lo marca y lo pone primero. */
  con_servidor: boolean;
  /** Rubro de la cuenta (0152); null = todavía sin clasificar. */
  rubro_id: number | null;
}

export type OrdenClientes = "recientes" | "nombre" | "ultima_venta" | "valor";

/** Filtro por rubro de la cuenta (0152): el id del catálogo como texto
 *  («6») o «sin» para las cuentas que todavía no tienen rubro. */
export type RubroFiltro = string | null;

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
    rubro?: RubroFiltro;
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
    p_rubro: opciones.rubro ?? null,
  });
  if (error) {
    console.error("listar_clientes:", error.message);
    return { total: 0, filas: [] };
  }
  return data as unknown as { total: number; filas: FilaClienteListado[] };
}

export interface FilaOportunidadListado {
  id: string;
  etapa: string;
  intencion: string;
  monto_estimado: number | null;
  moneda: string;
  proxima_accion: string | null;
  proxima_accion_at: string | null;
  updated_at: string;
  origen: string;
  cuenta_id: string;
  razon_social: string;
  tipo_doc: string;
  es_empresa: boolean;
  cotizacion_estado: string | null;
}

export type OrdenOportunidades = "reciente" | "monto" | "proxima_accion" | "cuenta";
export type TipoClienteFiltro = "empresa" | "persona";

/** listar_oportunidades() (migración 0054): pagina en Postgres con los
 *  filtros que Carlos pidió el 21-08 (empresa/persona, etapa, "para
 *  retomar" por rango de fecha) — nunca traer oportunidades crudas al
 *  servidor, un comercial como Katerine tiene miles. */
export async function listarOportunidades(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opciones: {
    q?: string;
    comercialId?: string | null;
    etapa?: string | null;
    tipoCliente?: TipoClienteFiltro | null;
    desde?: string | null;
    hasta?: string | null;
    soloCrm?: boolean;
    orden?: OrdenOportunidades;
    limite?: number;
    offset?: number;
    rubro?: RubroFiltro;
  },
): Promise<{ total: number; filas: FilaOportunidadListado[] }> {
  const { data, error } = await supabase.rpc("listar_oportunidades", {
    p_q: opciones.q ?? null,
    p_comercial: opciones.comercialId ?? null,
    p_etapa: opciones.etapa ?? null,
    p_tipo_cliente: opciones.tipoCliente ?? null,
    p_desde: opciones.desde ?? null,
    p_hasta: opciones.hasta ?? null,
    p_solo_crm: opciones.soloCrm ?? false,
    p_orden: opciones.orden ?? "reciente",
    p_limite: opciones.limite ?? 50,
    p_offset: opciones.offset ?? 0,
    p_rubro: opciones.rubro ?? null,
  });
  if (error) {
    console.error("listar_oportunidades:", error.message);
    return { total: 0, filas: [] };
  }
  return data as unknown as { total: number; filas: FilaOportunidadListado[] };
}

/** contar_oportunidades_por_etapa() (migración 0054): mismos filtros que
 *  listar_oportunidades salvo la etapa misma — para que los conteos de las
 *  pestañas coincidan con lo que se ve al hacer clic en cada una. */
export async function contarOportunidadesPorEtapa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opciones: {
    q?: string;
    comercialId?: string | null;
    tipoCliente?: TipoClienteFiltro | null;
    desde?: string | null;
    hasta?: string | null;
    soloCrm?: boolean;
    rubro?: RubroFiltro;
  },
): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("contar_oportunidades_por_etapa", {
    p_q: opciones.q ?? null,
    p_comercial: opciones.comercialId ?? null,
    p_tipo_cliente: opciones.tipoCliente ?? null,
    p_desde: opciones.desde ?? null,
    p_hasta: opciones.hasta ?? null,
    p_solo_crm: opciones.soloCrm ?? false,
    p_rubro: opciones.rubro ?? null,
  });
  if (error) {
    console.error("contar_oportunidades_por_etapa:", error.message);
    return {};
  }
  return data as unknown as Record<string, number>;
}

/** USD con separador peruano, sin decimales (para KPIs). */
export function usd(n: number): string {
  return `US$ ${Math.round(n).toLocaleString("es-PE")}`;
}
export function pct(n: number): string {
  return `${Math.round(n)}%`;
}
