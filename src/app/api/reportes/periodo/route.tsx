import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyLima } from "@/lib/periodo";
import { sumarDias } from "@/lib/calendario";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { esMarcaWhatsapp, WHATSAPP_CUENTA_PARA_META } from "@/lib/gestion-whatsapp";
import { diaLima, pendientesPropios, presupuestosPropios, ventasPropias, type PresupuestoPropio, type VentaPropia } from "@/lib/trabajo-propio";
import { ReportePeriodoPdf, type DiaPeriodo, type ReportePeriodoProps } from "@/lib/pdf/reporte-periodo-pdf";

/**
 * EL REPORTE POR FECHAS (buzón, Gabriela PV2, 12-10, con gerencia): «solamente
 * tiene para generar reportes del día, más no para filtrar de un día a otro
 * día, o de un mes», «una pestaña de sus presupuestos de la semana», «que se
 * verifiquen los cierres de la semana, los seguimientos realizados».
 *
 * Del día que se elija al que se elija (hasta 3 meses), con el mismo detalle
 * del reporte del día: cada seguimiento con su cliente, vía, resultado y
 * nota; cada presupuesto con su estado; cada venta cerrada; sus actividades
 * complementarias y lo que le queda pendiente. Todo de UNA persona.
 *
 * Postventa se cuenta por quien hizo el trabajo (`trabajo-propio.ts`); un
 * comercial, como en su reporte del día, por su cartera. No se guarda nada:
 * se baja cuando se quiera.
 *
 * Autoriza la ruta (el propio, o gerencia/admin/central pidiendo el de otro)
 * y después se consulta con la llave de servicio: la RLS mira al dueño del
 * cliente y escondería las gestiones hechas sobre clientes de otra cartera.
 */

const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 93;
const TIPOS_CONTACTO = ["llamada", "whatsapp", "email", "visita", "showroom", "reunion_online"];
const LIMA = "-05:00";

const etiquetaDia = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const hoy = hoyLima();
  const p = (k: string) => {
    const v = url.searchParams.get(k);
    return v && RE_FECHA.test(v) ? v : null;
  };
  let desde = p("desde") ?? hoy;
  let hasta = p("hasta") ?? desde;
  if (hasta < desde) [desde, hasta] = [hasta, desde];
  if (hasta > hoy) hasta = hoy;
  if (desde > hoy) return NextResponse.json({ error: "Esas fechas todavía no llegan" }, { status: 400 });
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5) + 1;
  if (dias > MAX_DIAS) return NextResponse.json({ error: "Elija un rango de hasta 3 meses" }, { status: 400 });

  const pedido = url.searchParams.get("comercial");
  if (pedido && pedido !== user.id) {
    const { data: yo } = await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
    if (!yo || !["gerencia", "admin", "central"].includes(String(yo.rol))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }
  const personaId = pedido ?? user.id;
  const admin = createAdminClient();

  const [{ data: perfil }, { data: tcFila }, { data: metaFila }] = await Promise.all([
    admin.from("perfiles").select("nombre, codigo_comercial, es_postventa, meta_gestiones_diarias").eq("id", personaId).maybeSingle(),
    admin.from("parametros").select("valor").eq("clave", "tc_usd_pen").maybeSingle(),
    admin.from("parametros").select("valor").eq("clave", "meta_seguimientos_diarios").maybeSingle(),
  ]);
  if (!perfil) return NextResponse.json({ error: "No encontré a esa persona" }, { status: 404 });
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

  const buffer = await renderToBuffer(
    <ReportePeriodoPdf
      logoBuffer={LOGO_BUFFER}
      rango={rango}
      comercial={{ nombre: perfil.nombre ?? "—", codigo: perfil.codigo_comercial ?? null }}
      porAutor={Boolean(perfil.es_postventa)}
      metaDiaria={metaDiaria}
      dias={resumenDias}
      seguimientos={seguimientos}
      presupuestos={presupuestos.map((c) => ({ ...c, dia: etiquetaDia(c.fecha) }))}
      ventas={ventas.map((v) => ({ ...v, dia: etiquetaDia(v.fecha) }))}
      complementarias={complementarias}
      pendientes={pendientes}
      hoy={etiquetaDia(hoy)}
    />,
  );

  const nombre = `Reporte ${perfil.codigo_comercial ?? ""} ${desde === hasta ? desde : `${desde} al ${hasta}`}.pdf`.replace(/\s+/g, " ").trim();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": cabeceraArchivo(nombre),
      "Cache-Control": "no-store",
    },
  });
}

/* Un comercial: lo de su cartera, igual que su reporte del día (enviados, por día de envío). */

async function presupuestosDeCartera(
  admin: ReturnType<typeof createAdminClient>,
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
  admin: ReturnType<typeof createAdminClient>,
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
