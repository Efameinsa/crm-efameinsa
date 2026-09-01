import { createClient } from "@/lib/supabase/server";

/**
 * El compendio de la gestión: cómo se hizo esta venta.
 *
 * Carlos lo pidió con nombre propio el 28-08, enumerando el expediente que
 * Central tiene que recibir: «tu cierre, cotización, orden de compra, orden de
 * servicio, voucher… **y CRM, que es un compendio solamente de esta operación:
 * cómo se hizo la gestión**».
 *
 * Es la pieza que faltaba para apagar el correo. Central ya ve los documentos
 * adjuntos, pero no ve el camino: por dónde entró el cliente, cuántas veces se
 * lo llamó, qué se le cotizó y en cuánto tiempo se cerró. Sin eso, la pantalla
 * le muestra MENOS que el sobre impreso, y por eso el sobre sigue existiendo.
 *
 * Todo sale de lo que el CRM ya registra: no se le pide a nadie que escriba
 * nada nuevo. Un compendio que hubiera que redactar no lo redactaría nadie.
 */

export interface HitoGestion {
  fecha: string;
  tipo: string;
  detalle: string | null;
  /** Quién lo hizo, cuando no es el comercial de la venta. */
  quien: string | null;
}

export interface CotizacionCompendio {
  codigo: string;
  serie: string;
  total: number;
  moneda: string;
  enviadaAt: string | null;
  aprobadaPorGerencia: boolean;
}

export interface Compendio {
  comercial: string;
  codigoComercial: string | null;
  /** Cómo entró: canal y fecha del lead, si vino de Central. */
  origenCanal: string | null;
  recibidoAt: string | null;
  derivadoAt: string | null;
  primeraGestionAt: string | null;
  cerradaAt: string | null;
  /** Días del primer contacto al cierre. La medida que gerencia mira. */
  diasDeCiclo: number | null;
  gestiones: number;
  hitos: HitoGestion[];
  cotizaciones: CotizacionCompendio[];
  /** Frase de una línea para el PDF, donde no entra la tabla entera. */
  resumen: string;
}

const dias = (desde: string | null, hasta: string | null): number | null => {
  if (!desde || !hasta) return null;
  return Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 864e5));
};

const ETIQUETA_TIPO: Record<string, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  email: "Correo",
  visita: "Visita",
  reunion_online: "Reunión online",
  showroom: "Showroom",
  filtro: "Filtro",
  nota: "Nota",
  otro: "Gestión",
};

const ETIQUETA_CANAL: Record<string, string> = {
  llamada: "una llamada",
  whatsapp: "WhatsApp",
  formulario_web: "el formulario de la web",
  facebook: "Facebook",
  presencial: "una visita presencial",
  email: "un correo",
  otro: "otro canal",
};

/**
 * De qué oportunidad habla este informe.
 *
 * Se busca por tres caminos porque hoy solo 2 de 9 informes traen la
 * oportunidad escrita: los demás nacieron desde la ficha del cliente, antes de
 * que el formulario preguntara de qué venta era. Sin este rastreo, el compendio
 * saldría vacío justo en los informes viejos, que son los que más falta hace
 * poder auditar.
 */
export async function oportunidadDelInforme(informe: {
  oportunidad_id?: string | null;
  venta_id?: string | null;
  cuenta_id?: string | null;
  fecha?: string | null;
}): Promise<string | null> {
  if (informe.oportunidad_id) return informe.oportunidad_id;
  const supabase = await createClient();

  if (informe.venta_id) {
    const { data } = await supabase.from("ventas").select("oportunidad_id").eq("id", informe.venta_id).maybeSingle();
    if (data?.oportunidad_id) return data.oportunidad_id as string;
  }
  if (informe.cuenta_id && informe.fecha) {
    // La venta del cliente CERCA DE LA FECHA DEL INFORME. El cerco de dos meses
    // no es una precaución teórica: sin él, el informe 001-2026 de Katerine se
    // enganchó con una venta de 2023 del mismo cliente y el PDF salió contando
    // la gestión equivocada — «1 gestión, 0 días», de hace tres años. Un
    // compendio que cuenta otra historia es peor que no tener compendio.
    const desde = new Date(new Date(`${informe.fecha.slice(0, 10)}T12:00:00`).getTime() - 60 * 864e5)
      .toISOString()
      .slice(0, 10);
    const hasta = new Date(new Date(`${informe.fecha.slice(0, 10)}T12:00:00`).getTime() + 60 * 864e5)
      .toISOString()
      .slice(0, 10);
    const { data } = await supabase
      .from("oportunidades")
      .select("id")
      .eq("cuenta_id", informe.cuenta_id)
      .eq("etapa", "venta")
      .gte("cerrada_at", `${desde}T00:00:00`)
      .lte("cerrada_at", `${hasta}T23:59:59`)
      .order("cerrada_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

/**
 * Arma el compendio de una oportunidad.
 *
 * Devuelve `null` cuando el informe no está atado a ninguna oportunidad: hay
 * informes viejos así, y es mejor no mostrar la sección que mostrarla vacía.
 */
export async function cargarCompendio(oportunidadId: string | null): Promise<Compendio | null> {
  if (!oportunidadId) return null;
  const supabase = await createClient();

  const { data: op } = await supabase
    .from("oportunidades")
    .select(
      // leads! desambiguado: desde la 0141 hay dos FK entre estas tablas.
      "id, created_at, cerrada_at, lead_id, comercial_id, perfiles:comercial_id(nombre, codigo_comercial), leads!oportunidades_lead_id_fkey(canal, recibido_at)",
    )
    .eq("id", oportunidadId)
    .maybeSingle();
  if (!op) return null;

  const [{ data: actividades }, { data: cotizaciones }, { data: asignacion }] = await Promise.all([
    supabase
      .from("actividades")
      .select("tipo, nota, realizada_at, realizada_por, perfiles:realizada_por(nombre)")
      .eq("oportunidad_id", oportunidadId)
      .order("realizada_at", { ascending: true })
      .limit(60),
    supabase
      .from("cotizaciones")
      .select("codigo, serie, total, moneda, enviada_at, estado_aprobacion")
      .eq("oportunidad_id", oportunidadId)
      .order("created_at", { ascending: true }),
    op.lead_id
      ? supabase
          .from("asignaciones")
          .select("created_at")
          .eq("lead_id", op.lead_id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const lista = (actividades ?? []) as unknown as {
    tipo: string;
    nota: string | null;
    realizada_at: string;
    realizada_por: string | null;
    perfiles: { nombre: string } | null;
  }[];

  const perfil = op.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
  const lead = op.leads as unknown as { canal: string; recibido_at: string } | null;

  const recibidoAt = lead?.recibido_at ?? null;
  const derivadoAt = (asignacion as { created_at?: string } | null)?.created_at ?? op.created_at ?? null;
  const primeraGestionAt = lista[0]?.realizada_at ?? null;
  const cerradaAt = op.cerrada_at ?? null;

  // Los hitos: no las 60 gestiones, sino las que cuentan una historia — la
  // primera, las visitas y reuniones, y las tres últimas antes del cierre.
  // Una lista de 40 llamadas no la lee nadie; seis líneas sí.
  const importantes = lista.filter((a) => ["visita", "reunion_online", "showroom"].includes(a.tipo));
  const seleccion = [...new Set([lista[0], ...importantes, ...lista.slice(-3)].filter(Boolean))].sort((a, b) =>
    a.realizada_at.localeCompare(b.realizada_at),
  );

  const hitos: HitoGestion[] = seleccion.map((a) => ({
    fecha: a.realizada_at,
    tipo: ETIQUETA_TIPO[a.tipo] ?? a.tipo,
    detalle: a.nota,
    quien: a.perfiles?.nombre && a.perfiles.nombre !== perfil?.nombre ? a.perfiles.nombre : null,
  }));

  const cots: CotizacionCompendio[] = ((cotizaciones ?? []) as unknown as {
    codigo: string;
    serie: string;
    total: number;
    moneda: string;
    enviada_at: string | null;
    estado_aprobacion: string | null;
  }[]).map((c) => ({
    codigo: c.codigo,
    serie: c.serie,
    total: Number(c.total),
    moneda: c.moneda,
    enviadaAt: c.enviada_at,
    // «aprobada_gerencia» es el valor real de la columna: gerencia firmó un
    // precio por debajo de la referencia. «auto_aprobada» es el caso normal.
    aprobadaPorGerencia: c.estado_aprobacion === "aprobada_gerencia",
  }));

  const diasDeCiclo = dias(recibidoAt ?? derivadoAt, cerradaAt);
  // El plural de «gestión» es «gestiones», sin tilde: pegarle «es» al singular
  // salía «gestiónes» en el PDF que va a Central.
  const partes = [
    `${lista.length} ${lista.length === 1 ? "gestión" : "gestiones"}`,
    cots.length ? `${cots.length} ${cots.length === 1 ? "cotización" : "cotizaciones"}` : null,
    diasDeCiclo != null ? `${diasDeCiclo} día${diasDeCiclo === 1 ? "" : "s"} del primer contacto al cierre` : null,
    cots.some((c) => c.aprobadaPorGerencia) ? "con aprobación de gerencia" : null,
  ].filter(Boolean);

  return {
    comercial: perfil?.nombre ?? "—",
    codigoComercial: perfil?.codigo_comercial ?? null,
    origenCanal: lead ? (ETIQUETA_CANAL[lead.canal] ?? lead.canal) : null,
    recibidoAt,
    derivadoAt,
    primeraGestionAt,
    cerradaAt,
    diasDeCiclo,
    gestiones: lista.length,
    hitos,
    cotizaciones: cots,
    resumen: partes.join(" · "),
  };
}
