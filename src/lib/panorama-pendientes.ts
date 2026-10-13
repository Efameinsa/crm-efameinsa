import type { SupabaseClient } from "@supabase/supabase-js";
import { sumarDias } from "@/lib/calendario";
import { lineaDe, type Linea } from "@/lib/panel-postventa";
import { estadoPresupuesto, diaLima } from "@/lib/trabajo-propio";
import { ETIQUETA_TIPO_PENDIENTE, type PendienteAnotado } from "@/lib/pendientes-anotados";

/**
 * LO QUE LE FALTA GESTIONAR (Santos, 13-10: «esa agenda debe mostrar el
 * panorama total de lo que falta, para que se organice y rápidamente vea lo
 * pendiente o las cuentas pendientes»). La hoja «Lo que falta gestionar» del
 * reporte diario de postventa: TODO lo suyo, sin cortar en diez —
 *   · los seguimientos de su cartera vencidos, del día y de los próximos siete
 *     días, con su línea (repuestos, mantenimiento…) y cuántos días de atraso;
 *   · sus presupuestos que no salieron;
 *   · lo que anotó a mano con su tipo.
 *
 * Un día pasado se lee AL CIERRE de ese día, igual que `pendientesPropios`: la
 * próxima acción que dejó la última gestión registrada hasta esa noche. Los
 * expedientes que hoy están cerrados (venta, rechazo…) no cuentan.
 * Con la llave de servicio: la ruta ya autorizó.
 */

export interface SeguimientoPendiente {
  cliente: string;
  linea: Linea;
  accion: string | null;
  fecha: string;
  hora: string | null;
  /** Días de atraso respecto del día del reporte (0 = ese día; negativo = viene). */
  atraso: number;
}

export interface PanoramaPendientes {
  dia: string;
  seguimientos: SeguimientoPendiente[];
  presupuestos: { cliente: string; codigo: string | null; estado: string; monto: string; armado: string; dias: number }[];
  anotados: { tipo: string; titulo: string; fecha: string; hora: string | null; atraso: number }[];
}

const LIMA = "-05:00";
const finDia = (f: string) => new Date(`${sumarDias(f, 1)}T00:00:00${LIMA}`).toISOString();
const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86400000);
const monto = (t: number | string, m: string) => `${m === "PEN" ? "S/" : "US$"} ${Math.round(Number(t) || 0).toLocaleString("es-PE")}`;
const CERRADAS = "(venta,rechazada,derivada,historico)";

type Opp = {
  id: string;
  proxima_accion: string | null;
  proxima_accion_at: string | null;
  proxima_accion_hora: string | null;
  tipo_postventa: string | null;
  cuentas: { razon_social: string } | null;
};

export async function cargarPanorama(
  admin: SupabaseClient,
  personaId: string,
  dia: string,
  hoy: string,
  anotados: PendienteAnotado[],
): Promise<PanoramaPendientes> {
  const pasado = dia < hoy;
  const hasta = sumarDias(dia, 7);
  const fin = finDia(dia);

  const [{ data: opps }, { data: acts }, { data: cots }] = await Promise.all([
    admin
      .from("oportunidades")
      .select("id, proxima_accion, proxima_accion_at, proxima_accion_hora, tipo_postventa, cuentas(razon_social)")
      .eq("comercial_id", personaId)
      .eq("origen", "crm")
      .not("etapa", "in", CERRADAS)
      .limit(5000),
    pasado
      ? admin
          .from("actividades")
          .select("oportunidad_id, proxima_accion, proxima_accion_at, proxima_accion_hora, oportunidades!inner(comercial_id)")
          .eq("oportunidades.comercial_id", personaId)
          .lt("realizada_at", fin)
          .order("realizada_at", { ascending: false })
          .limit(10000)
      : Promise.resolve({ data: [] }),
    admin
      .from("cotizaciones")
      .select("codigo, total, moneda, estado, estado_aprobacion, created_at, enviada_at, anulada_at, oportunidades!cotizaciones_oportunidad_id_fkey(cuentas(razon_social))")
      .eq("creada_por", personaId)
      .eq("estado", "borrador")
      .lt("created_at", fin)
      .gte("created_at", new Date(`${sumarDias(dia, -60)}T00:00:00${LIMA}`).toISOString())
      .or(`enviada_at.is.null,enviada_at.gte.${fin}`)
      .order("created_at")
      .limit(500),
  ]);

  // Un día pasado: la próxima acción que dejó la última gestión hasta esa noche.
  type Act = { oportunidad_id: string; proxima_accion: string | null; proxima_accion_at: string | null; proxima_accion_hora: string | null };
  const ultima = new Map<string, Act>();
  for (const a of (acts ?? []) as unknown as Act[]) if (!ultima.has(a.oportunidad_id)) ultima.set(a.oportunidad_id, a);

  const seguimientos: SeguimientoPendiente[] = [];
  for (const o of (opps ?? []) as unknown as Opp[]) {
    const fuente = pasado && ultima.has(o.id) ? ultima.get(o.id)! : o;
    const fecha = fuente.proxima_accion_at?.slice(0, 10);
    if (!fecha || fecha > hasta) continue;
    seguimientos.push({
      cliente: o.cuentas?.razon_social ?? "Cliente sin nombre",
      linea: lineaDe(o.tipo_postventa),
      accion: fuente.proxima_accion,
      fecha,
      hora: fuente.proxima_accion_hora ? fuente.proxima_accion_hora.slice(0, 5) : null,
      atraso: dias(fecha, dia),
    });
  }
  // Lo más atrasado primero; lo que viene, por fecha.
  seguimientos.sort((a, b) => b.atraso - a.atraso || (a.hora ?? "99").localeCompare(b.hora ?? "99"));

  const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const finMs = Date.parse(fin);
  const presupuestos = ((cots ?? []) as unknown as {
    codigo: string | null;
    total: number | string;
    moneda: string;
    estado: string;
    estado_aprobacion: string | null;
    created_at: string;
    anulada_at: string | null;
    oportunidades: { cuentas: { razon_social: string } | null } | null;
  }[])
    .filter((c) => !c.anulada_at || Date.parse(c.anulada_at) >= finMs)
    .map((c) => {
      const armado = diaLima(c.created_at);
      return {
        cliente: c.oportunidades?.cuentas?.razon_social ?? "Cliente sin nombre",
        codigo: c.codigo,
        estado: estadoPresupuesto(c.estado, c.estado_aprobacion, false),
        monto: monto(c.total, c.moneda),
        armado: fechaCorta(armado),
        dias: dias(armado, dia),
      };
    })
    .sort((a, b) => b.dias - a.dias);

  return {
    dia,
    seguimientos,
    presupuestos,
    anotados: anotados
      .map((p) => ({ tipo: ETIQUETA_TIPO_PENDIENTE[p.tipo], titulo: p.titulo, fecha: p.fecha, hora: p.hora, atraso: dias(p.fecha, dia) }))
      .sort((a, b) => b.atraso - a.atraso),
  };
}
