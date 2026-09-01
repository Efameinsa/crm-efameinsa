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
/**
 * Cuánto antes de la derivación cuenta una gestión hecha en OTRA ficha del
 * mismo cliente. El caso real (PRO-08939, 31-08): la clienta escribió por el
 * formulario web Y por WhatsApp el mismo día; cada canal creó su lead y su
 * oportunidad sobre la misma cuenta. La comercial gestionó la primera ficha
 * 27 minutos ANTES de que Central derivara la segunda — la estaba atendiendo,
 * no ignorando. Un día de margen cubre ese cruce sin arrastrar historia vieja.
 */
export const HORAS_MARGEN_OTRA_FICHA = 24;

export type FocoDerivado = "sin_atender" | "en_gestion" | "cotizado" | "cerrado";
export type AlertaDerivado = "demora" | "frio" | null;

export interface GestionResumen {
  fecha: string;
  tipo: string;
  nota: string | null;
  /** La gestión vive en otra oportunidad del mismo cliente, no en la derivada. */
  otraFicha?: boolean;
}

export interface CotizacionResumen {
  id: string;
  codigo: string | null;
  estado: string;
  total: number | null;
  moneda: string;
  created_at: string;
  enviada_at: string | null;
  /** Cotizada en otra oportunidad del mismo cliente, no en la derivada. */
  otraFicha?: boolean;
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
  /** Cuántas de esas gestiones viven en otra oportunidad del mismo cliente. */
  gestionesOtraFicha: number;
  /** Las otras oportunidades del mismo cliente y comercial (para la ficha). */
  opsOtraFicha: string[];
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
  /**
   * El banco de pruebas se ve SOLO en modo ensayo. El 01-09 Santos auditó la
   * pantalla con gerencia y estaba sembrada de ensayos de capacitación
   * («esto es prueba, prueba, prueba») que hubo que borrar a mano: las filas
   * es_prueba estaban diseñadas para no contar en nada, pero esta consulta
   * nunca las filtró.
   */
  incluirPractica?: boolean;
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
  /** El expediente al que fue a parar (0141): puede ser compartido con otro lead. */
  oportunidad_id: string | null;
};

const CAMPOS_LEAD =
  "id, codigo, nombre_contacto, razon_social, telefono, email, canal, mensaje, recibido_at, asignado_at, asignado_a, cuenta_id, es_prueba, oportunidad_id";

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
  // es_prueba es NOT NULL default false: el .eq no traga filas por null.
  if (!f.incluirPractica) q = q.eq("es_prueba", false);
  if (f.comercial) q = q.eq("asignado_a", f.comercial);
  const busqueda = (f.busqueda ?? "").trim();
  if (busqueda) {
    // TAMBIÉN POR EL NOMBRE DEL CLIENTE, no solo por lo que trajo el contacto.
    //
    // El 29-08 Central dio por perdido el PRO-09015: buscó «HUAYPAR» —la razón
    // social que ve en el título de la ficha y la que usa para hablar de ese
    // cliente— y no salió nada, así que concluyó que el contacto no estaba en
    // sus derivados. Estaba: lo había derivado ella misma dos días antes, pero
    // el contacto entró por el formulario de Google Ads con el nombre «hotel
    // dubai» y sin razón social. «HUAYPAR DE LA CRUZ TEOFILO» vive en la
    // CUENTA, que hasta acá no se miraba.
    //
    // Con 300 derivaciones en 30 días, un contacto que no aparece al buscarlo
    // por el nombre del cliente es un contacto perdido — que es exactamente la
    // queja que hizo nacer esta pantalla, entrando por otra puerta.
    //
    // Va en dos consultas y no en un filtro anidado porque PostgREST no combina
    // un `or` sobre la tabla con un `or` sobre la relación: se resuelven las
    // cuentas que coinciden y sus ids entran al mismo `or`.
    // Y TAMBIÉN POR EL DNI DE LA PERSONA, no solo por el documento de la empresa.
    //
    // Central pidió el 31-08 poder buscar «por DNI y RUC además del nombre».
    // Al mirarlo resultó que el RUC ya se buscaba —está en `num_doc` del lead y
    // de la cuenta— y que había dos motivos por los que ella creía que no:
    //
    //   1. El cuadro de búsqueda decía «Código, nombre, empresa o teléfono». No
    //      nombraba el documento, así que no había por qué suponer que servía.
    //      Una función que no se anuncia, para quien la usa no existe.
    //   2. El DNI de la PERSONA no se buscaba en ninguna parte. Vive en
    //      `contactos.documento` y esta consulta nunca lo miraba. Hay casos
    //      reales: el PRO-08980 de GRADOS MENDOZA GUILLERMO tiene el DNI
    //      10764033 cargado en su contacto y buscarlo no devolvía nada.
    //
    // Se resuelve igual que las cuentas: una consulta aparte cuyos ids entran
    // al mismo `or`, porque PostgREST no combina un `or` sobre la tabla con uno
    // sobre la relación.
    //
    // Los documentos en la base están limpios —0 de 11.124 tienen algo que no
    // sea dígito—, pero quien busca sí puede escribir «20-392817167» o dejar un
    // espacio, así que se prueba también la versión sin separadores.
    const soloDigitos = busqueda.replace(/[^0-9]/g, "");
    const pareceDocumento = soloDigitos.length >= 8;

    const [{ data: cuentas }, { data: porDni }] = await Promise.all([
      supabase
        .from("cuentas")
        .select("id")
        .or(`razon_social.ilike.%${busqueda}%,num_doc.ilike.%${busqueda}%`)
        .limit(200),
      pareceDocumento
        ? supabase.from("contactos").select("cuenta_id").ilike("documento", `%${soloDigitos}%`).limit(200)
        : Promise.resolve({ data: null }),
    ]);

    const ids = [
      ...new Set([
        ...(cuentas ?? []).map((c) => c.id as string),
        ...((porDni ?? []) as { cuenta_id: string | null }[]).map((c) => c.cuenta_id).filter((x): x is string => !!x),
      ]),
    ];

    const condiciones = [
      `codigo.ilike.%${busqueda}%`,
      `nombre_contacto.ilike.%${busqueda}%`,
      `telefono.ilike.%${busqueda}%`,
      `razon_social.ilike.%${busqueda}%`,
      `num_doc.ilike.%${busqueda}%`,
      ...(pareceDocumento && soloDigitos !== busqueda ? [`num_doc.ilike.%${soloDigitos}%`] : []),
      ...(ids.length > 0 ? [`cuenta_id.in.(${ids.join(",")})`] : []),
    ];
    q = q.or(condiciones.join(","));
  }

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

  const cuentaIds = [...new Set(leads.map((l) => l.cuenta_id).filter((x): x is string => Boolean(x)))];

  // OTRA FICHA DEL MISMO CLIENTE (observación de gerencia, 31-08). El mismo
  // cliente entra dos veces —formulario web y WhatsApp a Central— y cada
  // entrada crea su lead y su oportunidad sobre la MISMA cuenta. El comercial
  // gestiona una; la otra queda vacía, y este reporte la marcaba «nadie lo ha
  // tocado» en rojo. De 21 derivaciones «sin gestión» en los 30 días previos
  // al 01-09, 7 eran esta falsa alarma. Por eso acá se piden TODAS las
  // oportunidades de esas cuentas: si el mismo comercial gestionó al cliente
  // en otra ficha desde la derivación, se muestra — diciendo dónde vive.
  const margenMs = HORAS_MARGEN_OTRA_FICHA * 3_600_000;
  const asignados = leads.map((l) => (l.asignado_at ? new Date(l.asignado_at).getTime() : Infinity));
  const margenDesde = Math.min(...asignados) - margenMs;

  // El expediente de cada lead se resuelve por DOS caminos: el directo
  // (leads.oportunidad_id, 0141 — cubre a los que se SUMARON a un expediente
  // existente) y el histórico (oportunidades.lead_id, que solo recuerda al
  // primer lead). Se piden ambos y el directo manda.
  const idsOpDirecta = [...new Set(leads.map((l) => l.oportunidad_id).filter((x): x is string => Boolean(x)))];

  const [{ data: opsDeLead }, { data: opsDirectas }, { data: opsCuenta }] = await Promise.all([
    supabase
      .from("oportunidades")
      .select("id, lead_id, etapa, cerrada_at, proxima_accion, proxima_accion_at")
      .in("lead_id", ids),
    idsOpDirecta.length
      ? supabase
          .from("oportunidades")
          .select("id, lead_id, etapa, cerrada_at, proxima_accion, proxima_accion_at")
          .in("id", idsOpDirecta)
      : Promise.resolve({ data: [] as never[] }),
    cuentaIds.length && Number.isFinite(margenDesde)
      ? supabase.from("oportunidades").select("id, cuenta_id, comercial_id").in("cuenta_id", cuentaIds)
      : Promise.resolve({ data: [] as { id: string; cuenta_id: string; comercial_id: string | null }[] }),
  ]);
  const ops = [...new Map([...(opsDeLead ?? []), ...(opsDirectas ?? [])].map((o) => [o.id, o])).values()];
  const opIds = ops.map((o) => o.id);
  const opIdsPropias = new Set(opIds);
  const opIdsGemelas = (opsCuenta ?? []).map((o) => o.id).filter((id) => !opIdsPropias.has(id));

  // Las actividades se piden ascendentes para quedarse en una sola pasada con
  // la PRIMERA (el tiempo hasta el primer contacto) y con la última.

  type ActCruda = { oportunidad_id: string; tipo: string; nota: string | null; realizada_at: string };
  const isoMargen = Number.isFinite(margenDesde) ? new Date(margenDesde).toISOString() : null;

  const [
    { data: cots },
    { data: acts },
    { data: asignaciones },
    { data: cuentas },
    { data: urgencias },
    { data: actsGemelas },
    { data: cotsGemelas },
  ] = await Promise.all([
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
    // El nombre del CLIENTE. Muchos contactos entran por el formulario de la
    // web sin razón social —el PRO-09015 llegó como «hotel dubai»— y el nombre
    // por el que todos lo llaman está en la cuenta. Sin esto, buscar por ese
    // nombre encontraba la fila pero la fila mostraba otro nombre, que confunde
    // más que no encontrarla.
    cuentaIds.length
      ? supabase.from("cuentas").select("id, razon_social").in("id", cuentaIds)
      : Promise.resolve({ data: [] as { id: string; razon_social: string }[] }),
    supabase
      .from("recordatorios_urgencia")
      .select("lead_id, created_at")
      .in("lead_id", ids)
      .order("created_at", { ascending: false }),
    // Las gestiones en las fichas gemelas, acotadas por fecha: la historia
    // vieja de la cuenta (hay importadas de 2024) no es atención a ESTA
    // derivación. El corte fino, por el asignado_at de cada lead, se hace
    // abajo; este .gte solo evita traer años de actividad de gusto.
    opIdsGemelas.length && isoMargen
      ? supabase
          .from("actividades")
          .select("oportunidad_id, tipo, nota, realizada_at")
          .in("oportunidad_id", opIdsGemelas)
          .gte("realizada_at", isoMargen)
          .order("realizada_at")
      : Promise.resolve({ data: [] as ActCruda[] }),
    opIdsGemelas.length && isoMargen
      ? supabase
          .from("cotizaciones")
          .select("id, codigo, oportunidad_id, estado, enviada_at, total, moneda, created_at")
          .in("oportunidad_id", opIdsGemelas)
          .gte("created_at", isoMargen)
          .order("created_at")
      : Promise.resolve({ data: [] as (CotizacionResumen & { oportunidad_id: string })[] }),
  ]);

  const opPorLead = new Map((ops ?? []).map((o) => [o.lead_id as string, o]));
  const opPorId = new Map((ops ?? []).map((o) => [o.id as string, o]));
  const motivoPorLead = new Map((asignaciones ?? []).map((a) => [a.lead_id as string, a.motivo as string]));
  const cuentaPorId = new Map((cuentas ?? []).map((c) => [c.id as string, c.razon_social as string]));

  const cotsPorOp = new Map<string, (CotizacionResumen & { oportunidad_id: string })[]>();
  for (const c of [...(cots ?? []), ...(cotsGemelas ?? [])] as unknown as (CotizacionResumen & {
    oportunidad_id: string;
  })[]) {
    const xs = cotsPorOp.get(c.oportunidad_id) ?? [];
    xs.push(c);
    cotsPorOp.set(c.oportunidad_id, xs);
  }

  // Todas las gestiones por oportunidad (propias y gemelas): cada id vive en
  // UNA de las dos consultas, así que el orden ascendente se conserva.
  const actsPorOp = new Map<string, ActCruda[]>();
  for (const a of [...(acts ?? []), ...(actsGemelas ?? [])] as ActCruda[]) {
    const xs = actsPorOp.get(a.oportunidad_id) ?? [];
    xs.push(a);
    actsPorOp.set(a.oportunidad_id, xs);
  }

  const opsPorCuenta = new Map<string, { id: string; comercial_id: string | null }[]>();
  for (const o of (opsCuenta ?? []) as { id: string; cuenta_id: string; comercial_id: string | null }[]) {
    const xs = opsPorCuenta.get(o.cuenta_id) ?? [];
    xs.push(o);
    opsPorCuenta.set(o.cuenta_id, xs);
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
    // El vínculo directo manda: si el lead se SUMÓ a un expediente (0141),
    // ese es su expediente aunque oportunidades.lead_id recuerde a otro.
    const op = (l.oportunidad_id ? opPorId.get(l.oportunidad_id) : undefined) ?? opPorLead.get(l.id) ?? null;
    const gestion = op ? gestionPorOp.get(op.id) : undefined;

    // Lo que el MISMO comercial hizo con este cliente en sus OTRAS fichas,
    // desde la derivación (con el margen hacia atrás). Es la respuesta honesta
    // a «¿alguien lo atendió?» cuando el contacto entró dos veces.
    const gestionesOtra: GestionResumen[] = [];
    const cotsOtra: CotizacionResumen[] = [];
    const opsOtraFicha: string[] = [];
    const desdeLead = l.asignado_at ? new Date(l.asignado_at).getTime() - margenMs : null;
    if (l.cuenta_id && l.asignado_a && desdeLead !== null) {
      for (const o of opsPorCuenta.get(l.cuenta_id) ?? []) {
        if (o.id === op?.id || o.comercial_id !== l.asignado_a) continue;
        const actsO = (actsPorOp.get(o.id) ?? []).filter((a) => new Date(a.realizada_at).getTime() >= desdeLead);
        const cotsO = (cotsPorOp.get(o.id) ?? []).filter((c) => new Date(c.created_at).getTime() >= desdeLead);
        if (actsO.length || cotsO.length) opsOtraFicha.push(o.id);
        for (const a of actsO) gestionesOtra.push({ fecha: a.realizada_at, tipo: a.tipo, nota: a.nota, otraFicha: true });
        for (const c of cotsO) cotsOtra.push({ ...c, otraFicha: true });
      }
    }
    gestionesOtra.sort((a, b) => a.fecha.localeCompare(b.fecha));

    const candidatasPrimera = [gestion?.primera, gestionesOtra[0]].filter((x): x is GestionResumen => Boolean(x));
    const candidatasUltima = [gestion?.ultima, gestionesOtra[gestionesOtra.length - 1]].filter(
      (x): x is GestionResumen => Boolean(x),
    );
    const primeraGestion = candidatasPrimera.sort((a, b) => a.fecha.localeCompare(b.fecha))[0] ?? null;
    const ultimaGestion = candidatasUltima.sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null;
    const cotizaciones = [...(op ? (cotsPorOp.get(op.id) ?? []) : []), ...cotsOtra].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );

    const base = {
      id: l.id,
      codigo: l.codigo,
      nombreContacto: l.nombre_contacto,
      // El del lead si lo trajo; si no, el de la cuenta, que es el nombre por
      // el que la empresa conoce a ese cliente.
      razonSocial: l.razon_social ?? (l.cuenta_id ? (cuentaPorId.get(l.cuenta_id) ?? null) : null),
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
      gestiones: (gestion?.total ?? 0) + gestionesOtra.length,
      gestionesOtraFicha: gestionesOtra.length,
      opsOtraFicha,
      primeraGestion,
      ultimaGestion,
      cotizaciones,
      urgencias: urgenciasPorLead.get(l.id) ?? null,
    };
    return { ...base, ...clasificar(base, ahora) };
  });
}
