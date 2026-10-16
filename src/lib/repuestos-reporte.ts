import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * «SOLICITUDES DE REPUESTO · ABIERTAS Y CERRADAS» en el reporte diario de
 * postventa (reunión 16-10 17:57 con Ariana: «¿dónde está en tu agenda los
 * repuestos que te han solicitado el día de hoy? … algunos están abiertos y
 * los otros están cerrados… abierto y cerrado, simple, así como manzanita»).
 * Abierto = se está trabajando (sin gestión todavía, en gestión con el
 * almacén, cotizado). Cerrado = vendido o cerrado con su motivo (por ejemplo,
 * ya se le había cotizado al mismo cliente). La consulta de stock al almacén
 * todavía no queda en el CRM: el estado sale del expediente. Llave de
 * servicio: la ruta ya autorizó.
 */
export interface RepuestoFila {
  cliente: string;
  pedido: string | null;
  recibido: string;
  estado: string;
  abierto: boolean;
  /** Llegó ese mismo día. */
  nuevo: boolean;
}

export interface RepuestosDelReporte {
  abiertas: RepuestoFila[];
  cerradas: RepuestoFila[];
  nuevasHoy: number;
}

const LIMA = "-05:00";
const ESTADO: Record<string, string> = {
  asignada: "Sin gestión todavía",
  seguimiento: "En gestión",
  cotizada: "Cotizado, esperando respuesta",
};

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit" });

export async function cargarRepuestos(admin: SupabaseClient, personaId: string, fecha: string): Promise<RepuestosDelReporte> {
  const inicio = new Date(`${fecha}T00:00:00${LIMA}`).toISOString();
  const fin = new Date(Date.parse(inicio) + 86_400_000).toISOString();
  const { data } = await admin
    .from("oportunidades")
    .select("id, etapa, created_at, cerrada_at, motivo_rechazo_id, cuentas(razon_social)")
    .eq("comercial_id", personaId)
    .eq("tipo_postventa", "repuesto")
    .lt("created_at", fin)
    .or(`etapa.in.(asignada,seguimiento,cotizada),and(etapa.in.(venta,rechazada),cerrada_at.gte.${inicio},cerrada_at.lt.${fin})`)
    .order("created_at", { ascending: false })
    .limit(400);
  const opps = (data ?? []) as unknown as {
    id: string; etapa: string; created_at: string; cerrada_at: string | null; motivo_rechazo_id: number | null;
    cuentas: { razon_social: string } | null;
  }[];
  if (!opps.length) return { abiertas: [], cerradas: [], nuevasHoy: 0 };

  const ids = opps.map((o) => o.id);
  const motivosIds = [...new Set(opps.map((o) => o.motivo_rechazo_id).filter((x): x is number => x != null))];
  const [{ data: leads }, { data: cots }, { data: motivos }, { data: acts }] = await Promise.all([
    admin.from("leads").select("oportunidad_id, mensaje, recibido_at").in("oportunidad_id", ids),
    admin.from("cotizaciones").select("oportunidad_id, codigo, enviada_at").in("oportunidad_id", ids).is("anulada_at", null),
    motivosIds.length ? admin.from("catalogo_motivos_rechazo").select("id, nombre").in("id", motivosIds) : Promise.resolve({ data: [] }),
    admin.from("actividades").select("oportunidad_id, nota, realizada_at").in("oportunidad_id", ids).order("realizada_at", { ascending: false }).limit(2000),
  ]);
  const pedido = new Map<string, { mensaje: string | null; recibido_at: string }>();
  for (const l of (leads ?? []) as { oportunidad_id: string; mensaje: string | null; recibido_at: string }[]) {
    const ya = pedido.get(l.oportunidad_id);
    if (!ya || l.recibido_at > ya.recibido_at) pedido.set(l.oportunidad_id, l);
  }
  const cotizacion = new Map<string, string>();
  for (const c of (cots ?? []) as { oportunidad_id: string; codigo: string | null; enviada_at: string | null }[])
    if (c.enviada_at && c.codigo) cotizacion.set(c.oportunidad_id, c.codigo);
  const motivo = new Map(((motivos ?? []) as { id: number; nombre: string }[]).map((m) => [m.id, m.nombre]));
  const ultimaNota = new Map<string, string>();
  for (const a of (acts ?? []) as { oportunidad_id: string; nota: string | null }[])
    if (!ultimaNota.has(a.oportunidad_id) && a.nota) ultimaNota.set(a.oportunidad_id, a.nota);

  const filas = opps.map((o): RepuestoFila => {
    const abierto = !["venta", "rechazada"].includes(o.etapa);
    const recibidoIso = pedido.get(o.id)?.recibido_at ?? o.created_at;
    let estado: string;
    if (o.etapa === "venta") estado = "Vendido";
    else if (o.etapa === "rechazada") {
      const m = o.motivo_rechazo_id != null ? motivo.get(o.motivo_rechazo_id) : null;
      // «Otro (explicar en la nota)» no dice nada: va la nota de la última gestión.
      estado = `Cerrado: ${m && !/^otro/i.test(m) ? m : (ultimaNota.get(o.id) ?? "sin motivo anotado")}`;
    } else if (cotizacion.has(o.id)) estado = `Cotizado (${cotizacion.get(o.id)}), esperando respuesta`;
    else estado = ESTADO[o.etapa] ?? o.etapa;
    return {
      cliente: o.cuentas?.razon_social ?? "Cliente sin nombre",
      pedido: pedido.get(o.id)?.mensaje ?? null,
      recibido: fechaCorta(recibidoIso),
      estado,
      abierto,
      nuevo: recibidoIso >= inicio && recibidoIso < fin,
    };
  });
  return {
    abiertas: filas.filter((f) => f.abierto),
    cerradas: filas.filter((f) => !f.abierto),
    nuevasHoy: filas.filter((f) => f.nuevo).length,
  };
}
