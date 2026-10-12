import type { SupabaseClient } from "@supabase/supabase-js";
import { sumarDias } from "@/lib/calendario";
import { esMarcaWhatsapp, WHATSAPP_CUENTA_PARA_META } from "@/lib/gestion-whatsapp";
import { diaLima, pendientesPropios, presupuestosPropios, ventasPropias, type PresupuestoPropio, type VentaPropia } from "@/lib/trabajo-propio";
import type { DiaPeriodo, ReportePeriodoProps } from "@/lib/pdf/reporte-periodo-pdf";

/**
 * Los datos del reporte por fechas (`/api/reportes/periodo`), aparte de la
 * ruta para poder probarlo con datos reales. Va con la llave de servicio:
 * QUIEN LLAME TIENE QUE HABER AUTORIZADO ANTES.
 */

const TIPOS_CONTACTO = ["llamada", "whatsapp", "email", "visita", "showroom", "reunion_online"];
const LIMA = "-05:00";

const etiquetaDia = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");

export async function cargarReportePeriodo(
  admin: SupabaseClient,
  personaId: string,
  desde: string,
  hasta: string,
  hoy: string,
): Promise<(Omit<ReportePeriodoProps, "logoBuffer"> & { codigo: string | null }) | null> {

  const [{ data: perfil }, { data: tcFila }, { data: metaFila }] = await Promise.all([
    admin.from("perfiles").select("nombre, codigo_comercial, es_postventa, meta_gestiones_diarias").eq("id", personaId).maybeSingle(),
    admin.from("parametros").select("valor").eq("clave", "tc_usd_pen").maybeSingle(),
    admin.from("parametros").select("valor").eq("clave", "meta_seguimientos_diarios").maybeSingle(),
  ]);
  if (!perfil) return null;
  const tc = Number(tcFila?.valor) || 3.75;
  const metaDiaria = Number(perfil.meta_gestiones_diarias) || Number(metaFila?.valor) || 30;
  const inicio = new Date(`${desde}T00:00:00${LIMA}`).toISOString();
  const fin = new Date(`${sumarDias(hasta, 1)}T00:00:00${LIMA}`).toISOString();

  type Act = {
    realizada_at: string;
    tipo: string;
    nota: string | null;
    resultado_id: number | null;
    catalogo_resultados_gestion: { codigo: string; nombre: string } | null;
    oportunidades: { cuentas: { razon_social: string } | null } | null;
  };

  const [acts, presupuestos, ventas, tareas, bitacora, pendientes] = await Promise.all([
    admin
      .from("actividades")
      .select("realizada_at, tipo, nota, resultado_id, catalogo_resultados_gestion(codigo, nombre), oportunidades(cuentas(razon_social))")
      .eq("realizada_por", personaId)
      .in("tipo", TIPOS_CONTACTO)
      .gte("realizada_at", inicio)
      .lt("realizada_at", fin)
      .order("realizada_at")
      .limit(5000)
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as unknown as Act[];
      }),
    perfil.es_postventa ? presupuestosPropios(admin, personaId, desde, hasta) : presupuestosDeCartera(admin, personaId, inicio, fin),
    perfil.es_postventa ? ventasPropias(admin, personaId, desde, hasta, tc) : ventasDeCartera(admin, personaId, desde, hasta, tc),
    admin
      .from("tareas_agenda")
      .select("fecha, hora, titulo")
      .eq("comercial_id", personaId)
      .eq("completada", true)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha")
      .limit(2000)
      .then(({ data }) => data ?? []),
    admin
      .from("bitacora_dia")
      .select("fecha, orden, texto")
      .eq("perfil_id", personaId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha")
      .order("orden")
      .limit(2000)
      .then(({ data }) => data ?? []),
    pendientesPropios(admin, personaId, hoy).catch(() => null),
  ]);

  // Las marcas de un botón en los chats de campaña no son seguimientos (igual que en el reporte del día).
  const seguimientos: ReportePeriodoProps["seguimientos"] = acts
    .filter((a) => WHATSAPP_CUENTA_PARA_META || !esMarcaWhatsapp(a.tipo, a.nota))
    .map((a) => {
      const fecha = diaLima(a.realizada_at);
      return {
        fecha,
        dia: etiquetaDia(fecha),
        hora: new Date(a.realizada_at).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }),
        cliente: a.oportunidades?.cuentas?.razon_social ?? "Cliente sin nombre",
        tipo: a.tipo,
        nota: a.nota,
        resultado: a.catalogo_resultados_gestion?.nombre ?? null,
        efectivo: a.resultado_id == null || a.catalogo_resultados_gestion?.codigo !== "NO_CONTESTO",
      };
    });

  const complementarias: ReportePeriodoProps["complementarias"] = [
    ...tareas.map((t) => ({ fecha: String(t.fecha), dia: etiquetaDia(String(t.fecha)), hora: t.hora ? String(t.hora).slice(0, 5) : null, titulo: String(t.titulo) })),
    ...bitacora.map((b) => ({ fecha: String(b.fecha), dia: etiquetaDia(String(b.fecha)), hora: null, titulo: String(b.texto) })),
  ].sort((x, y) => x.fecha.localeCompare(y.fecha) || (x.hora ?? "99").localeCompare(y.hora ?? "99"));

  // Día por día, de lunes a sábado (el domingo solo si se trabajó).
  const resumenDias: DiaPeriodo[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const s = seguimientos.filter((x) => x.fecha === f);
    const c = presupuestos.filter((x) => x.fecha === f);
    const v = ventas.filter((x) => x.fecha === f);
    const domingo = new Date(`${f}T12:00:00`).getDay() === 0;
    if (domingo && s.length + c.length + v.length === 0) continue;
    resumenDias.push({
      fecha: f,
      etiqueta: etiquetaDia(f),
      efectivos: s.filter((x) => x.efectivo).length,
      sinContacto: s.filter((x) => !x.efectivo).length,
      cotizaciones: c.length,
      enviadas: c.filter((x) => x.enviada).length,
      ventas: v.length,
      montoUsd: v.reduce((t, x) => t + x.monto_usd, 0),
      habil: !domingo,
    });
  }

  const largo = (iso: string, conAnio: boolean) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      ...(conAnio ? { year: "numeric" as const } : {}),
    });
  const rango = desde === hasta ? largo(desde, true) : `Del ${largo(desde, false)} al ${largo(hasta, true)}`;

  return {
    codigo: perfil.codigo_comercial ?? null,
    rango,
    comercial: { nombre: perfil.nombre ?? "—", codigo: perfil.codigo_comercial ?? null },
    porAutor: Boolean(perfil.es_postventa),
    metaDiaria,
    dias: resumenDias,
    seguimientos,
    presupuestos: presupuestos.map((c) => ({ ...c, dia: etiquetaDia(c.fecha) })),
    ventas: ventas.map((v) => ({ ...v, dia: etiquetaDia(v.fecha) })),
    complementarias,
    pendientes,
    hoy: etiquetaDia(hoy),
  };
}

/* Un comercial: lo de su cartera, igual que su reporte del día (enviados, por día de envío). */

async function presupuestosDeCartera(
  admin: SupabaseClient,
  personaId: string,
  inicio: string,
  fin: string,
): Promise<PresupuestoPropio[]> {
  const { data, error } = await admin
    .from("cotizaciones")
    .select("codigo, total, moneda, estado, estado_aprobacion, enviada_at, oportunidades!cotizaciones_oportunidad_id_fkey!inner(comercial_id, cuentas(razon_social))")
    .eq("oportunidades.comercial_id", personaId)
    .is("anulada_at", null)
    .gte("enviada_at", inicio)
    .lt("enviada_at", fin)
    .order("enviada_at")
    .limit(2000);
  if (error) throw error;
  return ((data ?? []) as unknown as {
    codigo: string | null;
    total: number;
    moneda: string;
    estado: string;
    estado_aprobacion: string | null;
    enviada_at: string;
    oportunidades: { cuentas: { razon_social: string } | null } | null;
  }[]).map((c) => ({
    fecha: diaLima(c.enviada_at),
    codigo: c.codigo,
    cliente: c.oportunidades?.cuentas?.razon_social ?? "Cliente sin nombre",
    total: Number(c.total) || 0,
    moneda: c.moneda,
    estado: c.estado,
    aprobacion: c.estado_aprobacion ?? "",
    enviada: true,
    estado_texto: c.estado === "aceptada" ? "Aceptado" : "Enviado",
  }));
}

async function ventasDeCartera(
  admin: SupabaseClient,
  personaId: string,
  desde: string,
  hasta: string,
  tc: number,
): Promise<VentaPropia[]> {
  const { data, error } = await admin
    .from("ventas")
    .select("fecha_venta, monto_total, moneda, cotizaciones(codigo), oportunidades!inner(comercial_id, cuentas(razon_social))")
    .eq("oportunidades.comercial_id", personaId)
    .is("anulada_at", null)
    .gte("fecha_venta", desde)
    .lte("fecha_venta", hasta)
    .order("fecha_venta")
    .limit(2000);
  if (error) throw error;
  return ((data ?? []) as unknown as {
    fecha_venta: string;
    monto_total: number;
    moneda: string;
    cotizaciones: { codigo: string | null } | null;
    oportunidades: { cuentas: { razon_social: string } | null } | null;
  }[]).map((v) => {
    const monto = Number(v.monto_total) || 0;
    return {
      fecha: String(v.fecha_venta).slice(0, 10),
      cliente: v.oportunidades?.cuentas?.razon_social ?? "Cliente sin nombre",
      presupuesto: v.cotizaciones?.codigo ?? null,
      monto,
      moneda: v.moneda,
      monto_usd: v.moneda === "PEN" ? monto / tc : monto,
    };
  });
}
