import type { createClient } from "@/lib/supabase/server";

/**
 * Lo que Central derivó, con el rastro completo de lo que el comercial hizo
 * después. Vive acá y no en la página porque lo consumen dos pantallas: la
 * lista (/central/derivados) y la ficha de una derivación (…/[id]).
 *
 * EL DATO QUE FALTABA. Hasta hoy la lista mostraba la etapa de la
 * oportunidad, y eso no responde la pregunta de Central: «¿alguien lo llamó?».
 * La oportunidad la crea la propia asignación (RPC asignar_lead, 0002) en
 * etapa 'asignada', así que un contacto abandonado y uno recién derivado se
 * veían idénticos. Lo que separa a uno del otro son las ACTIVIDADES: la
 * primera gestión registrada es la prueba de que el comercial lo tocó, y el
 * tiempo entre la derivación y esa primera gestión es la medida de
 * supervisión que Central y gerencia venían sacando a mano.
 */

/** Umbral de reclamo: derivado hace más de un día y nadie lo tocó. */
const HORAS_SIN_ATENDER = 24;
/** Un contacto en gestión que lleva más de una semana quieto está frío. */
const DIAS_SIN_MOVER = 7;

export type FocoDerivado = "sin_atender" | "en_gestion" | "cotizado" | "cerrado";
export type AlertaDerivado = "demora" | "frio" | null;

export interface GestionResumen {
  fecha: string;
  tipo: string;
  nota: string | null;
}

export interface CotizacionResumen {
  id: string;
  codigo: string | null;
  estado: string;
  total: number | null;
  moneda: string;
  created_at: string;
  enviada_at: string | null;
}

export interface DerivadoFila {
  id: string;
  codigo: string | null;
  nombreContacto: string | null;
  razonSocial: string | null;
  telefono: string | null;
  email: string | null;
  canal: string;
  mensaje: string | null;
  recibidoAt: string | null;
  asignadoAt: string | null;
  asignadoA: string | null;
  cuentaId: string | null;
  /** Fila del banco de pruebas: solo se ve pidiéndola y no cuenta en ningún número. */
  esPrueba: boolean;
  comercial: { id: string; nombre: string; codigo_comercial: string | null } | null;
  motivo: string | null;
  oportunidad: {
    id: string;
    etapa: string;
    cerrada_at: string | null;
    proxima_accion: string | null;
    proxima_accion_at: string | null;
  } | null;
  gestiones: number;
  primeraGestion: GestionResumen | null;
  ultimaGestion: GestionResumen | null;
  cotizaciones: CotizacionResumen[];
  urgencias: { ultima: string; total: number } | null;
  foco: FocoDerivado;
  alerta: AlertaDerivado;
}

export const ETIQUETA_ETAPA: Record<string, { texto: string; clase: string }> = {
  asignada: { texto: "Recibido, sin filtrar", clase: "bg-secondary text-muted-foreground" },
  filtrada: { texto: "Filtrado", clase: "bg-secondary text-foreground" },
  cotizada: { texto: "Cotizado", clase: "bg-primary/10 text-primary" },
  seguimiento: { texto: "En seguimiento", clase: "bg-primary/10 text-primary" },
  potencial: { texto: "En negociación", clase: "bg-amber-500/15 text-amber-800" },
  venta: { texto: "Vendido", clase: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  rechazada: { texto: "No prosperó", clase: "bg-destructive/10 text-destructive" },
  derivada: { texto: "Pasado a otro", clase: "bg-secondary text-muted-foreground" },
};

export const ETIQUETA_MOTIVO: Record<string, string> = {
  nuevo_lead: "Cliente nuevo",
  cartera_existente: "Ya era su cartera",
  liberacion_6_meses: "Liberado (6 meses sin venta)",
  decision_gerencia: "Decisión de gerencia",
  reemplazo: "Reemplazo de personal",
};

export const ETIQUETA_CANAL: Record<string, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  formulario_web: "Formulario web",
  facebook: "Facebook",
  instagram: "Instagram",
  email: "Correo",
  presencial: "Presencial",
  referido: "Referido",
  otro: "Otro",
};

export const ETIQUETA_FOCO: Record<FocoDerivado, string> = {
  sin_atender: "Sin atender",
  en_gestion: "En gestión",
  cotizado: "Cotizado",
  cerrado: "Cerrado",
};

/** "3 h 20 min", "2 d 4 h". Es la demora que gerencia venía midiendo a mano. */
export function demora(desde: string | null, hasta: string | null): string {
  if (!desde || !hasta) return "—";
  const min = Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** "hace 3 d", "hace 20 min". Para leer la antigüedad sin restar fechas. */
export function haceCuanto(iso: string | null, ahora = Date.now()): string {
  if (!iso) return "—";
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 31) return `hace ${d} d`;
  const meses = Math.floor(d / 30);
  return `hace ${meses} mes${meses === 1 ? "" : "es"}`;
}

function horasDesde(iso: string | null, ahora: number): number {
  if (!iso) return 0;
  return (ahora - new Date(iso).getTime()) / 3_600_000;
}

/**
 * En qué cajón cae la derivación y si hay que reclamar.
 *
 * El orden importa: primero lo cerrado (ya no se reclama), después lo que
 * tiene cotización (hubo trabajo de verdad), y recién al final se pregunta si
 * alguien lo tocó. Un contacto sin ninguna gestión y sin cotización está
 * abandonado, diga lo que diga la etapa.
 */
function clasificar(
  fila: Omit<DerivadoFila, "foco" | "alerta">,
  ahora: number,
): { foco: FocoDerivado; alerta: AlertaDerivado } {
  const etapa = fila.oportunidad?.etapa;
  if (etapa === "venta" || etapa === "rechazada" || etapa === "derivada") return { foco: "cerrado", alerta: null };

  const diasQuieto = horasDesde(fila.ultimaGestion?.fecha ?? null, ahora) / 24;
  if (fila.cotizaciones.length > 0)
    return { foco: "cotizado", alerta: diasQuieto > DIAS_SIN_MOVER ? "frio" : null };

  if (fila.gestiones === 0)
    return {
      foco: "sin_atender",
      alerta: horasDesde(fila.asignadoAt, ahora) > HORAS_SIN_ATENDER ? "demora" : null,
    };

  return { foco: "en_gestion", alerta: diasQuieto > DIAS_SIN_MOVER ? "frio" : null };
}

interface Filtros {
  desde: string;
  hasta: string;
  comercial?: string | null;
  busqueda?: string;
  limite?: number;
  /** Trae también las derivaciones del banco de pruebas (para ensayar el
   *  circuito sin tocar nada real). Por defecto quedan fuera. */
  incluirPruebas?: boolean;
}

type LeadCrudo = {
  id: string;
  codigo: string | null;
  nombre_contacto: string | null;
  razon_social: string | null;
  telefono: string | null;
  email: string | null;
  canal: string;
  mensaje: string | null;
  recibido_at: string | null;
  asignado_at: string | null;
  asignado_a: string | null;
  cuenta_id: string | null;
  es_prueba: boolean;
};

const CAMPOS_LEAD =
  "id, codigo, nombre_contacto, razon_social, telefono, email, canal, mensaje, recibido_at, asignado_at, asignado_a, cuenta_id, es_prueba";

/**
 * Las derivaciones del período con todo su rastro. Va en consultas separadas
 * y no en un join anidado porque la oportunidad cuelga del lead, y de la
 * oportunidad cuelgan tanto las cotizaciones como las actividades: pedirlo
 * junto devuelve una fila por cada combinación.
 */
export async function cargarDerivados(
  supabase: Awaited<ReturnType<typeof createClient>>,
  f: Filtros,
): Promise<DerivadoFila[]> {
  // Los perfiles no dependen de los leads, así que se piden JUNTO con ellos y
  // no antes: era un viaje de ida y vuelta entero esperando de gusto.
  const perfilesP = supabase.from("perfiles").select("id, nombre, codigo_comercial");

  let q = supabase
    .from("leads")
    .select(CAMPOS_LEAD)
    .eq("estado", "asignado")
    .gte("asignado_at", `${f.desde}T00:00:00-05:00`)
    .lte("asignado_at", `${f.hasta}T23:59:59-05:00`);
  if (!f.incluirPruebas) q = q.eq("es_prueba", false);
  if (f.comercial) q = q.eq("asignado_a", f.comercial);
  const busqueda = (f.busqueda ?? "").trim();
  if (busqueda)
    q = q.or(
      `codigo.ilike.%${busqueda}%,nombre_contacto.ilike.%${busqueda}%,telefono.ilike.%${busqueda}%,razon_social.ilike.%${busqueda}%`,
    );

  const [{ data: leads }, { data: perfiles }] = await Promise.all([
    q.order("asignado_at", { ascending: false }).limit(f.limite ?? 400),
    perfilesP,
  ]);
  return armar(supabase, (leads ?? []) as LeadCrudo[], perfiles ?? []);
}

/** La misma carga, para un solo contacto (la ficha de la derivación). */
export async function cargarDerivado(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
): Promise<DerivadoFila | null> {
  const [{ data: lead }, { data: perfiles }] = await Promise.all([
    supabase.from("leads").select(CAMPOS_LEAD).eq("id", leadId).maybeSingle(),
    supabase.from("perfiles").select("id, nombre, codigo_comercial"),
  ]);
  if (!lead) return null;
  const [fila] = await armar(supabase, [lead as LeadCrudo], perfiles ?? []);
  return fila ?? null;
}

async function armar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leads: LeadCrudo[],
  perfiles: { id: string; nombre: string; codigo_comercial: string | null }[],
): Promise<DerivadoFila[]> {
  const ids = leads.map((l) => l.id);
  if (ids.length === 0) return [];

  const { data: ops } = await supabase
    .from("oportunidades")
    .select("id, lead_id, etapa, cerrada_at, proxima_accion, proxima_accion_at")
    .in("lead_id", ids);
  const opIds = (ops ?? []).map((o) => o.id);

  // Las actividades se piden ascendentes para quedarse en una sola pasada con
  // la PRIMERA (el tiempo hasta el primer contacto) y con la última.
  const [{ data: cots }, { data: acts }, { data: asignaciones }, { data: urgencias }] = await Promise.all([
    opIds.length
      ? supabase
          .from("cotizaciones")
          .select("id, codigo, oportunidad_id, estado, enviada_at, total, moneda, created_at")
          .in("oportunidad_id", opIds)
          .order("created_at")
      : Promise.resolve({ data: [] as { oportunidad_id: string }[] }),
    opIds.length
      ? supabase
          .from("actividades")
          .select("oportunidad_id, tipo, nota, realizada_at")
          .in("oportunidad_id", opIds)
          .order("realizada_at")
      : Promise.resolve({ data: [] as { oportunidad_id: string; tipo: string; nota: string | null; realizada_at: string }[] }),
    supabase.from("asignaciones").select("lead_id, motivo").in("lead_id", ids),
    supabase
      .from("recordatorios_urgencia")
      .select("lead_id, created_at")
      .in("lead_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  const opPorLead = new Map((ops ?? []).map((o) => [o.lead_id as string, o]));
  const motivoPorLead = new Map((asignaciones ?? []).map((a) => [a.lead_id as string, a.motivo as string]));

  const cotsPorOp = new Map<string, CotizacionResumen[]>();
  for (const c of (cots ?? []) as unknown as (CotizacionResumen & { oportunidad_id: string })[]) {
    const xs = cotsPorOp.get(c.oportunidad_id) ?? [];
    xs.push(c);
    cotsPorOp.set(c.oportunidad_id, xs);
  }

  const gestionPorOp = new Map<string, { total: number; primera: GestionResumen; ultima: GestionResumen }>();
  for (const a of (acts ?? []) as { oportunidad_id: string; tipo: string; nota: string | null; realizada_at: string }[]) {
    const g: GestionResumen = { fecha: a.realizada_at, tipo: a.tipo, nota: a.nota };
    const previo = gestionPorOp.get(a.oportunidad_id);
    // Llegan ascendentes: la primera que se ve es la primera gestión.
    if (!previo) gestionPorOp.set(a.oportunidad_id, { total: 1, primera: g, ultima: g });
    else gestionPorOp.set(a.oportunidad_id, { total: previo.total + 1, primera: previo.primera, ultima: g });
  }

  const urgenciasPorLead = new Map<string, { ultima: string; total: number }>();
  for (const u of urgencias ?? []) {
    const previo = urgenciasPorLead.get(u.lead_id);
    // Vienen de la más nueva a la más vieja: la primera es la última enviada.
    urgenciasPorLead.set(u.lead_id, { ultima: previo?.ultima ?? u.created_at, total: (previo?.total ?? 0) + 1 });
  }

  const perfilPorId = new Map(perfiles.map((c) => [c.id, c]));
  const ahora = Date.now();

  return leads.map((l) => {
    const op = opPorLead.get(l.id) ?? null;
    const gestion = op ? gestionPorOp.get(op.id) : undefined;
    const base = {
      id: l.id,
      codigo: l.codigo,
      nombreContacto: l.nombre_contacto,
      razonSocial: l.razon_social,
      telefono: l.telefono,
      email: l.email,
      canal: l.canal,
      mensaje: l.mensaje,
      recibidoAt: l.recibido_at,
      asignadoAt: l.asignado_at,
      asignadoA: l.asignado_a,
      cuentaId: l.cuenta_id,
      esPrueba: Boolean(l.es_prueba),
      comercial: l.asignado_a ? (perfilPorId.get(l.asignado_a) ?? null) : null,
      motivo: motivoPorLead.get(l.id) ?? null,
      oportunidad: op,
      gestiones: gestion?.total ?? 0,
      primeraGestion: gestion?.primera ?? null,
      ultimaGestion: gestion?.ultima ?? null,
      cotizaciones: op ? (cotsPorOp.get(op.id) ?? []) : [],
      urgencias: urgenciasPorLead.get(l.id) ?? null,
    };
    return { ...base, ...clasificar(base, ahora) };
  });
}
