import type { SupabaseClient } from "@supabase/supabase-js";
import { sumarDias } from "@/lib/calendario";

/**
 * EL TRABAJO DE UNA PERSONA, CONTADO POR QUIEN LO HIZO (buzón, Gabriela PV2,
 * 12-10, con gerencia: «no es todo lo que ella ha trabajado… exclusivamente de
 * ella, sus pendientes de ella, no de Rubí»).
 *
 * El reporte del comercial cuenta presupuestos y ventas por el DUEÑO DE LA
 * OPORTUNIDAD, y para un comercial está bien: el cliente es suyo. En postventa
 * no: Gabriela cotiza y cierra repuestos y mantenimientos de clientes que
 * están en la cartera de Rubí o de un comercial (el 10-10 cerró PERUVIAN
 * NATURE, US$ 2,960, con su Presu_1116-26, y su reporte decía «0 ventas»). Y
 * un presupuesto de postventa pasa por gerencia antes de salir, así que
 * contar solo los «enviados» escondía los que armó y esperan aprobación.
 *
 * Por eso, en postventa:
 *   · presupuesto = el que ARMÓ (`creada_por`), fechado el día que salió o,
 *     si todavía no salió, el día que lo armó; con su estado real;
 *   · venta = la de su presupuesto; sin presupuesto, la que registró ella; y
 *     si la registró alguien de fuera de postventa (Central), la del dueño
 *     del cliente, como antes.
 *
 * Todo se consulta con la llave de servicio porque la RLS mira al dueño del
 * cliente y escondería justo lo que se quiere mostrar. QUIEN LLAME TIENE QUE
 * HABER AUTORIZADO ANTES (el propio, o gerencia/admin/central).
 */

const LIMA = "-05:00";
const inicioDia = (fecha: string) => new Date(`${fecha}T00:00:00${LIMA}`).toISOString();
const finDia = (fecha: string) => new Date(`${sumarDias(fecha, 1)}T00:00:00${LIMA}`).toISOString();
export const diaLima = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

export interface PresupuestoPropio {
  fecha: string;
  codigo: string | null;
  cliente: string;
  total: number;
  moneda: string;
  estado: string;
  aprobacion: string;
  enviada: boolean;
  /** Cómo se lee en el reporte: «Enviado», «En gerencia», «Observado por gerencia»… */
  estado_texto: string;
}

export interface VentaPropia {
  fecha: string;
  cliente: string;
  presupuesto: string | null;
  monto: number;
  moneda: string;
  monto_usd: number;
}

export function estadoPresupuesto(estado: string, aprobacion: string | null, enviada: boolean): string {
  if (estado === "aceptada") return "Aceptado";
  if (estado === "rechazada") return "No aceptado";
  if (enviada) return "Enviado";
  if (aprobacion === "pendiente_gerencia") return "En gerencia";
  if (aprobacion === "rechazada_gerencia") return "Observado por gerencia";
  if (aprobacion === "aprobada_gerencia" || aprobacion === "auto_aprobada") return "Aprobado, por enviar";
  return "Borrador";
}

type FilaCotizacion = {
  codigo: string | null;
  total: number | string;
  moneda: string;
  estado: string;
  estado_aprobacion: string | null;
  enviada_at: string | null;
  created_at: string;
  oportunidades: { cuentas: { razon_social: string } | null } | null;
};

/** Los presupuestos que la persona armó, salidos (o armados y todavía sin salir) entre `desde` y `hasta`. */
export async function presupuestosPropios(
  admin: SupabaseClient,
  personaId: string,
  desde: string,
  hasta: string,
): Promise<PresupuestoPropio[]> {
  const a = inicioDia(desde);
  const b = finDia(hasta);
  const { data, error } = await admin
    .from("cotizaciones")
    .select("codigo, total, moneda, estado, estado_aprobacion, enviada_at, created_at, oportunidades!cotizaciones_oportunidad_id_fkey(cuentas(razon_social))")
    .eq("creada_por", personaId)
    .is("anulada_at", null)
    .or(`and(enviada_at.gte.${a},enviada_at.lt.${b}),and(enviada_at.is.null,created_at.gte.${a},created_at.lt.${b})`)
    .order("created_at")
    .limit(2000);
  if (error) throw error;
  return ((data ?? []) as unknown as FilaCotizacion[])
    .map((c) => {
      const enviada = c.enviada_at != null;
      return {
        fecha: diaLima(c.enviada_at ?? c.created_at),
        codigo: c.codigo,
        cliente: c.oportunidades?.cuentas?.razon_social ?? "Cliente sin nombre",
        total: Number(c.total) || 0,
        moneda: c.moneda,
        estado: c.estado,
        aprobacion: c.estado_aprobacion ?? "",
        enviada,
        estado_texto: estadoPresupuesto(c.estado, c.estado_aprobacion, enviada),
      };
    })
    .sort((x, y) => x.fecha.localeCompare(y.fecha));
}

type FilaVenta = {
  fecha_venta: string;
  monto_total: number | string;
  moneda: string;
  registrada_por: string | null;
  cotizaciones: { codigo: string | null; creada_por: string | null } | null;
  oportunidades: { comercial_id: string | null; cuentas: { razon_social: string } | null } | null;
};

/** Las ventas que cerró la persona entre `desde` y `hasta` (fecha de la venta, día de calendario). */
export async function ventasPropias(
  admin: SupabaseClient,
  personaId: string,
  desde: string,
  hasta: string,
  tc: number,
): Promise<VentaPropia[]> {
  const [{ data, error }, { data: postventa }] = await Promise.all([
    admin
      .from("ventas")
      .select("fecha_venta, monto_total, moneda, registrada_por, cotizaciones(codigo, creada_por), oportunidades!inner(comercial_id, cuentas(razon_social))")
      .is("anulada_at", null)
      .gte("fecha_venta", desde)
      .lte("fecha_venta", hasta)
      .limit(5000),
    admin.from("perfiles").select("id").eq("es_postventa", true),
  ]);
  if (error) throw error;
  const dePostventa = new Set((postventa ?? []).map((p) => String(p.id)));
  return ((data ?? []) as unknown as FilaVenta[])
    .filter((v) => {
      const autor = v.cotizaciones?.creada_por ?? v.registrada_por;
      if (autor === personaId) return true;
      // Registrada por alguien de fuera del área (Central, un comercial): vale el dueño del cliente.
      return (!autor || !dePostventa.has(autor)) && v.oportunidades?.comercial_id === personaId;
    })
    .map((v) => {
      const monto = Number(v.monto_total) || 0;
      return {
        fecha: String(v.fecha_venta).slice(0, 10),
        cliente: v.oportunidades?.cuentas?.razon_social ?? "Cliente sin nombre",
        presupuesto: v.cotizaciones?.codigo ?? null,
        monto,
        moneda: v.moneda,
        monto_usd: v.moneda === "PEN" ? monto / tc : monto,
      };
    })
    .sort((x, y) => x.fecha.localeCompare(y.fecha));
}

export interface BloquePendientes {
  titulo: string;
  filas: { cliente: string; detalle: string | null }[];
}

const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * LO PENDIENTE DE LA PERSONA, NO DEL ÁREA: sus presupuestos que no salieron
 * (en gerencia, observados, aprobados sin enviar) y los seguimientos de SU
 * cartera para hoy y los que se pasaron de fecha (mismo criterio que la
 * tarjeta «Agenda» del reporte del día: oportunidades vivas del CRM).
 */
/**
 * Con `alCierreDe` (un día pasado), lo que estaba pendiente AL CERRAR ESE DÍA
 * y no lo de hoy (12-10: el reporte del viernes mostraba «para hoy» los del
 * lunes). Se reconstruye:
 *   · presupuestos: armados hasta esa noche que todavía no habían salido (y no
 *     estaban anulados); si salieron después, se dice cuándo;
 *   · seguimientos: la próxima acción que dejó la última gestión registrada
 *     hasta esa noche en cada oportunidad de su cartera (cada gestión guarda
 *     la próxima acción que se programó). Una oportunidad sin gestiones lleva
 *     la que tiene ahora, que es la que se le puso al crearla.
 */
export async function pendientesPropios(
  admin: SupabaseClient,
  personaId: string,
  hoy: string,
  alCierreDe?: string,
): Promise<BloquePendientes[]> {
  if (alCierreDe && alCierreDe < hoy) return pendientesAlCierre(admin, personaId, alCierreDe);
  return pendientesDeHoy(admin, personaId, hoy);
}

const montoCorto = (total: number | string, moneda: string) =>
  `${moneda === "PEN" ? "S/" : "US$"} ${Math.round(Number(total) || 0).toLocaleString("es-PE")}`;

async function pendientesAlCierre(admin: SupabaseClient, personaId: string, dia: string): Promise<BloquePendientes[]> {
  const fin = finDia(dia);
  const [{ data: cots }, { data: acts }, { data: opps }] = await Promise.all([
    admin
      .from("cotizaciones")
      .select("codigo, total, moneda, estado, estado_aprobacion, created_at, enviada_at, anulada_at, oportunidades!cotizaciones_oportunidad_id_fkey(cuentas(razon_social))")
      .eq("creada_por", personaId)
      .lt("created_at", fin)
      .gte("created_at", inicioDia(sumarDias(dia, -60)))
      .or(`enviada_at.is.null,enviada_at.gte.${fin}`)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("actividades")
      .select("oportunidad_id, realizada_at, proxima_accion, proxima_accion_at, oportunidades!inner(comercial_id)")
      .eq("oportunidades.comercial_id", personaId)
      .lt("realizada_at", fin)
      .order("realizada_at", { ascending: false })
      .limit(10000),
    admin
      .from("oportunidades")
      .select("id, created_at, proxima_accion, proxima_accion_at, cuentas(razon_social)")
      .eq("comercial_id", personaId)
      .eq("origen", "crm")
      .lt("created_at", fin)
      .limit(5000),
  ]);

  // Anuladas después de esa noche: ese día seguían pendientes.
  const finMs = Date.parse(fin);
  const vivas = ((cots ?? []) as unknown as (FilaCotizacion & { anulada_at: string | null })[]).filter(
    (c) => !c.anulada_at || Date.parse(c.anulada_at) >= finMs,
  );
  const porEnviar = vivas.map((c) => {
    const salio = c.enviada_at ? ` · salió después, el ${fechaCorta(diaLima(c.enviada_at))}` : "";
    const estado = c.enviada_at ? "Todavía no salía" : estadoPresupuesto(c.estado, c.estado_aprobacion, false);
    return {
      cliente: c.oportunidades?.cuentas?.razon_social ?? "Cliente sin nombre",
      detalle: `${c.codigo ?? "Sin número"} · ${estado} · armado el ${fechaCorta(diaLima(c.created_at))} · ${montoCorto(c.total, c.moneda)}${salio}`,
    };
  });

  // La última gestión de cada oportunidad hasta esa noche (vienen de la más nueva a la más vieja).
  type Act = { oportunidad_id: string; proxima_accion: string | null; proxima_accion_at: string | null };
  const ultima = new Map<string, Act>();
  for (const a of (acts ?? []) as unknown as Act[]) if (!ultima.has(a.oportunidad_id)) ultima.set(a.oportunidad_id, a);

  type Opp = { id: string; proxima_accion: string | null; proxima_accion_at: string | null; cuentas: { razon_social: string } | null };
  const filas: { cliente: string; accion: string | null; fecha: string }[] = [];
  for (const o of (opps ?? []) as unknown as Opp[]) {
    const a = ultima.get(o.id);
    const fecha = a ? a.proxima_accion_at : o.proxima_accion_at;
    if (!fecha || fecha > dia) continue;
    filas.push({ cliente: o.cuentas?.razon_social ?? "Cliente sin nombre", accion: a ? a.proxima_accion : o.proxima_accion, fecha });
  }
  filas.sort((x, y) => y.fecha.localeCompare(x.fecha));
  const fila = (f: (typeof filas)[number]) => ({
    cliente: f.cliente,
    detalle: `${f.fecha === dia ? "Ese día" : `Programado el ${fechaCorta(f.fecha)}`}${f.accion ? ` · ${f.accion}` : ""}`,
  });

  return [
    { titulo: "Presupuestos que no habían salido", filas: porEnviar },
    { titulo: "Seguimientos programados para ese día", filas: filas.filter((f) => f.fecha === dia).map(fila) },
    { titulo: "Seguimientos que ya se habían pasado de fecha", filas: filas.filter((f) => f.fecha < dia).map(fila) },
  ];
}

async function pendientesDeHoy(admin: SupabaseClient, personaId: string, hoy: string): Promise<BloquePendientes[]> {
  const [{ data: cots }, { data: opps }] = await Promise.all([
    admin
      .from("cotizaciones")
      .select("codigo, total, moneda, estado, estado_aprobacion, created_at, oportunidades!cotizaciones_oportunidad_id_fkey(cuentas(razon_social))")
      .eq("creada_por", personaId)
      .is("anulada_at", null)
      .is("enviada_at", null)
      .in("estado", ["borrador"])
      .gte("created_at", inicioDia(sumarDias(hoy, -60)))
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("oportunidades")
      .select("proxima_accion, proxima_accion_at, proxima_accion_hora, cuentas(razon_social)")
      .eq("comercial_id", personaId)
      .eq("origen", "crm")
      .not("etapa", "in", "(venta,rechazada,derivada,historico)")
      .lte("proxima_accion_at", hoy)
      .order("proxima_accion_at", { ascending: false })
      .limit(2000),
  ]);

  const porEnviar = ((cots ?? []) as unknown as (FilaCotizacion & { created_at: string })[]).map((c) => ({
    cliente: c.oportunidades?.cuentas?.razon_social ?? "Cliente sin nombre",
    detalle: `${c.codigo ?? "Sin número"} · ${estadoPresupuesto(c.estado, c.estado_aprobacion, false)} · armado el ${fechaCorta(diaLima(c.created_at))} · ${montoCorto(c.total, c.moneda)}`,
  }));

  type Opp = { proxima_accion: string | null; proxima_accion_at: string; proxima_accion_hora: string | null; cuentas: { razon_social: string } | null };
  const lista = (opps ?? []) as unknown as Opp[];
  const fila = (o: Opp) => ({
    cliente: o.cuentas?.razon_social ?? "Cliente sin nombre",
    detalle: `${o.proxima_accion_at === hoy ? (o.proxima_accion_hora ? o.proxima_accion_hora.slice(0, 5) : "Hoy") : `Programado el ${fechaCorta(o.proxima_accion_at)}`}${o.proxima_accion ? ` · ${o.proxima_accion}` : ""}`,
  });
  const paraHoy = lista.filter((o) => o.proxima_accion_at === hoy).map(fila);
  const vencidas = lista.filter((o) => o.proxima_accion_at < hoy).map(fila);

  // Sin la cuenta en el título: cada PDF la pone (y recorta) a su manera.
  return [
    { titulo: "Presupuestos que todavía no salieron", filas: porEnviar },
    { titulo: "Seguimientos programados para hoy", filas: paraHoy },
    { titulo: "Seguimientos que se pasaron de fecha", filas: vencidas },
  ];
}
