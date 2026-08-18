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

// ============================================================
// EMBUDO REAL — lo que Google NO puede decirte
// ============================================================
// Google reporta sus propias "conversiones" (metrics.conversions), pero no
// sabe cuáles de esos contactos resultaron reales: cuáles Central descartó
// como spam, cuáles el comercial calificó, y cuáles terminaron en venta. Eso
// solo lo sabe el CRM. Cruzando `leads.utm_campaign` (que guarda el
// campaign_id de origen) con `campanias.campaign_id` se obtiene el embudo
// real y el CPL/CAC/ROAS de verdad.
//
// ATRIBUCIÓN POR COHORTE: los leads se filtran por su fecha de llegada, y
// luego se sigue su cadena (oportunidad → venta) SIN importar cuándo cerró la
// venta. Un lead de enero que compra en agosto cuenta para enero, que es
// cuando se pagó el anuncio que lo trajo. Filtrar las ventas por su propia
// fecha rompería la relación gasto↔resultado.

export interface EmbudoCampania {
  campaignId: string;
  nombre: string;
  plataforma: string;
  moneda: string;
  gasto: number;
  clics: number;
  leadsReportados: number; // lo que dice Google
  leadsCrm: number; // lo que realmente entró
  oportunidades: number;
  ventas: number;
  montoVentas: number;
  cplReal: number | null; // gasto / leads del CRM
  costoPorVenta: number | null; // gasto / ventas
  roas: number | null; // monto vendido / gasto
}

export interface EmbudoTotales {
  leadsCrm: number;
  oportunidades: number;
  ventas: number;
  montoVentas: number;
  gasto: number;
  moneda: string;
  cplReal: number | null;
  costoPorVenta: number | null;
  roas: number | null;
}

export interface ResumenEmbudo {
  porCampania: EmbudoCampania[];
  totales: EmbudoTotales | null;
  // Mismos totales pero contando solo el gasto del tramo con leads completos;
  // null cuando todo el rango es comparable (entonces `totales` ya sirve).
  totalesComparables: EmbudoTotales | null;
  leadsSinCampania: number;
  // Cuando hay gasto en un período pero los leads del CRM empiezan después
  // (Google borra los leads a los 60 días, así que los anteriores a la
  // conexión del webhook son irrecuperables), el CPL sale inflado: divide
  // gasto de N meses entre leads de menos meses. Se avisa en vez de mostrar
  // un número engañoso como si fuera bueno.
  desdeConLeads: string | null;
  cplNoComparable: boolean;
  tcUsdPen: number;
}

// tcUsdPen: las ventas están en USD y el gasto publicitario en PEN (Meta y
// Google facturan en soles). ROAS/costo por venta comparan ambos, así que
// las ventas se convierten a la moneda del gasto con el T.C. de gerencia
// (tabla parametros). Antes se dividía USD entre PEN sin convertir.
export async function cargarEmbudoReal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  resumen: ResumenMarketing,
  { desde, hasta }: { desde: string; hasta: string },
): Promise<ResumenEmbudo> {
  const { data: tcFila } = await supabase.from("parametros").select("valor").eq("clave", "tc_usd_pen").maybeSingle();
  const tcUsdPen = Number(tcFila?.valor ?? 3.75);
  const aMonedaGasto = (montoUsd: number, moneda: string, monedaGasto: string) => {
    const usd = moneda === "PEN" ? montoUsd / tcUsdPen : montoUsd;
    return monedaGasto === "PEN" ? usd * tcUsdPen : usd;
  };
  // Leads llegados en el rango que traen campaña de origen.
  const { data: leads } = await supabase
    .from("leads")
    .select("id, utm_campaign, recibido_at, asignado_a")
    .not("utm_campaign", "is", null)
    .gte("recibido_at", `${desde}T00:00:00`)
    .lte("recibido_at", `${hasta}T23:59:59`);

  const filasLeads = leads ?? [];
  const leadIds = filasLeads.map((l) => l.id);

  // Oportunidades nacidas de esos leads, y ventas de esas oportunidades.
  const { data: oportunidades } = leadIds.length
    ? await supabase.from("oportunidades").select("id, lead_id, etapa").in("lead_id", leadIds)
    : { data: [] as { id: string; lead_id: string | null; etapa: string }[] };
  const filasOportunidades = oportunidades ?? [];
  const oportunidadIds = filasOportunidades.map((o) => o.id);

  const { data: ventas } = oportunidadIds.length
    ? await supabase.from("ventas").select("oportunidad_id, monto_total, moneda").in("oportunidad_id", oportunidadIds)
    : { data: [] as { oportunidad_id: string; monto_total: number; moneda: string }[] };
  const filasVentas = ventas ?? [];

  // Índices para recorrer la cadena lead → oportunidad → venta.
  const campaniaPorLead = new Map(filasLeads.map((l) => [l.id, String(l.utm_campaign)]));
  const leadPorOportunidad = new Map(filasOportunidades.map((o) => [o.id, o.lead_id]));

  const acum = new Map<string, { leadsCrm: number; oportunidades: number; ventas: number; montoVentas: number }>();
  const vacio = () => ({ leadsCrm: 0, oportunidades: 0, ventas: 0, montoVentas: 0 });

  for (const l of filasLeads) {
    const c = String(l.utm_campaign);
    const a = acum.get(c) ?? vacio();
    a.leadsCrm++;
    acum.set(c, a);
  }
  // "Asignado a un comercial" = tiene oportunidad en el CRM O quedó asignado
  // en el registro de Central (leads.asignado_a, cargado desde el maestro de
  // Central para los leads históricos — scripts/enlazar-leads-central.mjs).
  // Un lead cuenta una sola vez aunque tenga varias oportunidades.
  const leadsConOportunidad = new Set(filasOportunidades.map((o) => o.lead_id).filter(Boolean));
  for (const l of filasLeads) {
    if (!leadsConOportunidad.has(l.id) && !l.asignado_a) continue;
    const c = String(l.utm_campaign);
    const a = acum.get(c) ?? vacio();
    a.oportunidades++;
    acum.set(c, a);
  }
  // "Ventas cerradas" = oportunidades GANADAS (etapa venta), no filas de la
  // tabla ventas: las ventas históricas sin monto en el Excel no tienen fila
  // en la tabla ventas pero son ventas reales (mostraba 3 cuando eran 5). El monto
  // sí sale solo de las que lo tienen.
  for (const o of filasOportunidades) {
    if (o.etapa !== "venta") continue;
    const c = o.lead_id ? campaniaPorLead.get(o.lead_id) : undefined;
    if (!c) continue;
    const a = acum.get(c) ?? vacio();
    a.ventas++;
    acum.set(c, a);
  }
  for (const v of filasVentas) {
    const leadId = leadPorOportunidad.get(v.oportunidad_id);
    const c = leadId ? campaniaPorLead.get(leadId) : undefined;
    if (!c) continue;
    const a = acum.get(c) ?? vacio();
    a.montoVentas += v.moneda === "PEN" ? v.monto_total / tcUsdPen : v.monto_total; // en USD
    acum.set(c, a);
  }

  // Se parte de las campañas CON GASTO en el rango (son las que importan para
  // costo por lead); se les pega lo que produjeron según el CRM.
  const porCampania: EmbudoCampania[] = resumen.porCampania.map((c) => {
    const campaignIdExterno = (resumen.filas.find((f) => f.campanias?.id === c.id)?.campanias?.campaign_id) ?? "";
    const a0 = acum.get(campaignIdExterno) ?? vacio();
    const a = { ...a0, montoVentas: aMonedaGasto(a0.montoVentas, "USD", c.moneda) };
    return {
      campaignId: campaignIdExterno,
      nombre: c.nombre,
      plataforma: c.plataforma,
      moneda: c.moneda,
      gasto: c.gasto,
      clics: c.clics,
      leadsReportados: c.leadsReportados,
      leadsCrm: a.leadsCrm,
      oportunidades: a.oportunidades,
      ventas: a.ventas,
      montoVentas: a.montoVentas,
      cplReal: a.leadsCrm > 0 ? c.gasto / a.leadsCrm : null,
      costoPorVenta: a.ventas > 0 ? c.gasto / a.ventas : null,
      roas: c.gasto > 0 && a.montoVentas > 0 ? a.montoVentas / c.gasto : null,
    };
  });

  // Leads con una campaña que no tiene gasto registrado en este rango (ej. la
  // sincronización de gasto aún no corrió, o el lead vino de una campaña vieja).
  const idsConGasto = new Set(porCampania.map((c) => c.campaignId));
  let leadsSinCampania = 0;
  for (const [campaignId, a] of acum) {
    if (!idsConGasto.has(campaignId)) leadsSinCampania += a.leadsCrm;
  }

  const monedaPrincipal = resumen.totalesPorMoneda[0]?.moneda ?? "PEN";
  const conGasto = porCampania.filter((c) => c.moneda === monedaPrincipal);
  const totales: EmbudoTotales | null = conGasto.length
    ? (() => {
        const gasto = conGasto.reduce((s, c) => s + c.gasto, 0);
        const leadsCrm = conGasto.reduce((s, c) => s + c.leadsCrm, 0);
        const oportunidades = conGasto.reduce((s, c) => s + c.oportunidades, 0);
        const ventas = conGasto.reduce((s, c) => s + c.ventas, 0);
        const montoVentas = conGasto.reduce((s, c) => s + c.montoVentas, 0);
        return {
          gasto,
          moneda: monedaPrincipal,
          leadsCrm,
          oportunidades,
          ventas,
          montoVentas,
          cplReal: leadsCrm > 0 ? gasto / leadsCrm : null,
          costoPorVenta: ventas > 0 ? gasto / ventas : null,
          roas: gasto > 0 && montoVentas > 0 ? montoVentas / gasto : null,
        };
      })()
    : null;

  // ¿El rango de gasto empieza antes que el primer lead que tenemos?
  // Se compara contra el lead más antiguo de TODA la base (no solo del rango),
  // que marca desde cuándo el CRM tiene registro de leads publicitarios.
  const { data: primerLead } = await supabase
    .from("leads")
    .select("recibido_at")
    .not("utm_campaign", "is", null)
    .order("recibido_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const desdeConLeads = primerLead?.recibido_at ? primerLead.recibido_at.slice(0, 10) : null;
  const cplNoComparable =
    desdeConLeads !== null &&
    desdeConLeads > desde &&
    resumen.filas.some((f) => f.fecha < desdeConLeads);

  // Cuando el rango incluye meses sin leads recuperables, se calcula además el
  // costo por lead SOLO del tramo con datos completos — así gerencia tiene un
  // número usable en vez de uno inflado o de un "—".
  let totalesComparables: EmbudoTotales | null = null;
  if (cplNoComparable && desdeConLeads && totales) {
    const gastoComparable = resumen.filas
      .filter((f) => f.fecha >= desdeConLeads && f.moneda === monedaPrincipal)
      .reduce((s, f) => s + f.gasto, 0);
    totalesComparables = {
      ...totales,
      gasto: gastoComparable,
      cplReal: totales.leadsCrm > 0 ? gastoComparable / totales.leadsCrm : null,
      costoPorVenta: totales.ventas > 0 ? gastoComparable / totales.ventas : null,
      roas: gastoComparable > 0 && totales.montoVentas > 0 ? totales.montoVentas / gastoComparable : null,
    };
  }

  return { porCampania, totales, totalesComparables, leadsSinCampania, desdeConLeads, cplNoComparable, tcUsdPen };
}
