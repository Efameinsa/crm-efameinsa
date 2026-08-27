import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { BotonReporteDiario } from "@/components/crm/boton-reporte-diario";
import { BotonCierreSemanal } from "@/components/crm/boton-cierre-semanal";
import { AgendaMensual, type AccionAgenda, type HechaAgenda, type VentaAgenda, type HistItem, type TareaAgenda } from "@/components/crm/agenda-mensual";
import { SemanaPotenciales } from "@/components/crm/semana-potenciales";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { cargarPotenciales, lunesSemana } from "@/lib/potenciales-semana";

export const dynamic = "force-dynamic";

// Agenda mensual del comercial (pedido de gerencia 18-08, validado sobre el
// mockup docs/mockups/agenda-comercial.html). Es una VISTA sobre el modelo
// existente — la próxima acción única por oportunidad — no una tabla de
// eventos paralela: lo que se ve aquí es exactamente lo que ve "Mi día".

function mesValido(m: string | undefined, hoy: string): string {
  return m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : hoy.slice(0, 7);
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const [perfil, sp] = await Promise.all([requerirPerfil(), searchParams]);
  const hoy = hoyLima();
  const mes = mesValido(sp.mes, hoy);
  const inicioMes = `${mes}-01`;
  const [y, m] = mes.split("-").map(Number);
  const finMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const supabase = await createClient();
  const lunes = lunesSemana();

  // ⚠️ CORREGIDO 24-08 (docs/11-plan-correcciones-prueba-23-08.md, A1).
  // ANTES esta consulta pedía TODAS las abiertas del comercial sin `limit`,
  // confiando en que eran "pocas por comercial". Dejó de ser cierto con el
  // import de los Excel: Katerine tiene 13.601 abiertas y Supabase corta en
  // 1.000 filas SIN AVISAR (el mismo bug que ya rompió Mi cartera y los
  // reportes de gerencia). Ordenadas por proxima_accion_at ascendente, esas
  // 1.000 eran todas de 1900 —fechas basura que arrastró el import— así que
  // la agenda jamás llegaba a 2026: había 75 acciones de agosto-2026 que el
  // comercial no podía ver. Ahora se piden acotadas en Postgres, en tres
  // baldes que son justo los que usa AgendaMensual (mes, vencidas, sin fecha).
  const CAMPOS =
    "id, etapa, intencion, monto_estimado, moneda, proxima_accion, proxima_accion_at, proxima_accion_hora, cuenta_id, cuentas(razon_social)";
  const abiertasDe = () =>
    supabase.from("oportunidades").select(CAMPOS).eq("comercial_id", perfil.id).not("etapa", "in", "(venta,rechazada,derivada)");

  // Las vencidas se traen de la MÁS RECIENTE hacia atrás: son las que todavía
  // se pueden retomar. Lo de 1900 queda fuera por sí solo, sin filtro ad hoc.
  const TOPE_VENCIDAS = 200;
  const TOPE_SIN_FECHA = 100;

  const [{ data: delMes }, { data: vencidasData }, { data: sinFechaData }] = await Promise.all([
    abiertasDe()
      .gte("proxima_accion_at", inicioMes)
      .lte("proxima_accion_at", finMes)
      .order("proxima_accion_at", { ascending: true })
      .limit(600),
    abiertasDe().lt("proxima_accion_at", hoy).order("proxima_accion_at", { ascending: false }).limit(TOPE_VENCIDAS),
    abiertasDe().is("proxima_accion_at", null).order("updated_at", { ascending: false }).limit(TOPE_SIN_FECHA),
  ]);

  type FilaOportunidad = NonNullable<typeof delMes>[number];
  const aAccion = (o: FilaOportunidad): AccionAgenda => ({
    id: o.id,
    etapa: o.etapa,
    intencion: o.intencion,
    monto: o.monto_estimado,
    moneda: o.moneda,
    accion: o.proxima_accion,
    fecha: o.proxima_accion_at,
    hora: o.proxima_accion_hora ? String(o.proxima_accion_hora).slice(0, 5) : null,
    cuentaId: o.cuenta_id,
    razonSocial: (o.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "Cuenta sin nombre",
  });

  // Una vencida de este mismo mes cae en los dos primeros baldes: se deduplica
  // por id para no pintar la tarjeta repetida.
  const porId = new Map<string, AccionAgenda>();
  for (const o of [...(delMes ?? []), ...(vencidasData ?? []), ...(sinFechaData ?? [])]) {
    if (!porId.has(o.id)) porId.set(o.id, aAccion(o));
  }
  const acciones: AccionAgenda[] = [...porId.values()];

  const [{ data: hechasData }, { data: ventasData }, { data: histData }, { data: resultados }, { data: motivos }, { data: tareasData }] = await Promise.all([
    supabase
      .from("actividades")
      .select("id, tipo, nota, realizada_at, oportunidad_id, oportunidades!inner(comercial_id, cuentas(razon_social))")
      .eq("oportunidades.comercial_id", perfil.id)
      .gte("realizada_at", `${inicioMes}T00:00:00`)
      .lte("realizada_at", `${finMes}T23:59:59`)
      .not("nota", "like", "[Histórico%")
      .order("realizada_at", { ascending: false })
      .limit(400),
    supabase
      .from("ventas")
      .select("id, fecha_venta, monto_total, moneda, oportunidad_id, oportunidades!inner(comercial_id, cuentas(razon_social))")
      .eq("oportunidades.comercial_id", perfil.id)
      .eq("origen", "crm")
      .gte("fecha_venta", inicioMes)
      .lte("fecha_venta", finMes)
      .limit(200),
    acciones.length
      ? supabase
          .from("actividades")
          .select("oportunidad_id, tipo, nota, realizada_at")
          .in("oportunidad_id", acciones.map((a) => a.id))
          .order("realizada_at", { ascending: false })
          .limit(80)
      : Promise.resolve({ data: [] as { oportunidad_id: string; tipo: string; nota: string | null; realizada_at: string }[] }),
    supabase.from("catalogo_resultados_gestion").select("id, codigo, nombre, accion_sugerida, dias_sugeridos, efecto").eq("activo", true).order("id"),
    supabase.from("catalogo_motivos_rechazo").select("id, nombre").eq("activo", true).order("nombre"),
    supabase
      .from("tareas_agenda")
      .select("id, titulo, fecha, hora, completada")
      .eq("comercial_id", perfil.id)
      .gte("fecha", inicioMes)
      .lte("fecha", finMes)
      .limit(500),
  ]);

  const hechas: HechaAgenda[] = (hechasData ?? []).map((a) => ({
    id: a.id,
    tipo: a.tipo,
    nota: a.nota,
    oportunidadId: a.oportunidad_id,
    fecha: String(a.realizada_at).slice(0, 10),
    razonSocial:
      ((a.oportunidades as unknown as { cuentas: { razon_social: string } | null } | null)?.cuentas?.razon_social) ?? "Cuenta sin nombre",
  }));

  const ventas: VentaAgenda[] = (ventasData ?? []).map((v) => ({
    id: v.id,
    oportunidadId: v.oportunidad_id,
    fecha: String(v.fecha_venta).slice(0, 10),
    monto: v.monto_total,
    moneda: v.moneda,
    razonSocial:
      ((v.oportunidades as unknown as { cuentas: { razon_social: string } | null } | null)?.cuentas?.razon_social) ?? "Cuenta sin nombre",
  }));

  // La proyección de la semana que va al pie (ing. Carlos, 27-08).
  const { potenciales } = await cargarPotenciales(lunes, perfil.id);

  const historial: Record<string, HistItem[]> = {};
  for (const h of histData ?? []) {
    if (!historial[h.oportunidad_id]) historial[h.oportunidad_id] = [];
    if (historial[h.oportunidad_id].length < 4) {
      historial[h.oportunidad_id].push({ tipo: h.tipo, nota: h.nota, fecha: String(h.realizada_at).slice(0, 10) });
    }
  }

  return (
    <div className="space-y-3">
      {/* Cierre del día: genera el PDF con la gestión de hoy para mandarlo por
          correo, en vez de armarlo a mano en Excel como hasta ahora. */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm">
        <p className="text-xs text-muted-foreground">
          Al terminar el día, descargue el reporte de su gestión para enviarlo a gerencia.
        </p>
        <div className="flex items-center gap-2">
          {/* El cierre de la semana vive al lado del reporte del día porque son
              el mismo hábito a distinta escala: «tiene que analizarse día a
              día, semanalmente» (ing. Carlos, 27-08). Está siempre, no solo el
              sábado — a mitad de semana sirve para ver cuánto falta. */}
          <BotonCierreSemanal semana={lunes} />
          <BotonReporteDiario fecha={hoy} etiqueta="Reporte de hoy" />
        </div>
      </div>
    <AgendaMensual
      mes={mes}
      hoy={hoy}
      acciones={acciones}
      hechas={hechas}
      ventas={ventas}
      historial={historial}
      resultados={resultados ?? []}
      motivos={motivos ?? []}
      tareas={(tareasData ?? []).map((t) => ({
        id: t.id,
        titulo: t.titulo,
        fecha: String(t.fecha).slice(0, 10),
        hora: t.hora ? String(t.hora).slice(0, 5) : null,
        completada: t.completada,
      })) as TareaAgenda[]}
    />

      {/* AL PIE DE LA AGENDA, todos los días (ing. Carlos, 27-08): «el lunes
          aparece el cliente A, el cliente B, acá 10.000, acá 20… y al final de
          la semana el total que debería vender. Esto todos los días que se
          muestre en tu agenda».
          Es el MISMO cuadro de «Mis potenciales» —mismo componente, mismos
          números— y no una versión aparte: dos totales que no cuadran entre
          dos pantallas son peores que no mostrarlos. */}
      <SeccionPanel titulo="Lo que proyecta cerrar esta semana">
        <SemanaPotenciales lunes={lunes} potenciales={potenciales} esGerencia={false} hoyISO={hoy} />
      </SeccionPanel>
    </div>
  );
}
