import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { AgendaMensual, type AccionAgenda, type HechaAgenda, type VentaAgenda, type HistItem, type TareaAgenda } from "@/components/crm/agenda-mensual";

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

  // Abiertas: pocas por comercial (el grueso histórico está cerrado) — se
  // traen todas para poder mostrar "Sin fecha" y las vencidas fuera del mes.
  const { data: abiertas } = await supabase
    .from("oportunidades")
    .select("id, etapa, intencion, monto_estimado, moneda, proxima_accion, proxima_accion_at, proxima_accion_hora, cuenta_id, cuentas(razon_social)")
    .eq("comercial_id", perfil.id)
    .not("etapa", "in", "(venta,rechazada,derivada)")
    .order("proxima_accion_at", { ascending: true });

  const acciones: AccionAgenda[] = (abiertas ?? []).map((o) => ({
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
  }));

  const [{ data: hechasData }, { data: ventasData }, { data: histData }, { data: resultados }, { data: motivos }, { data: tareasData }] = await Promise.all([
    supabase
      .from("actividades")
      .select("id, tipo, nota, realizada_at, oportunidades!inner(comercial_id, cuentas(razon_social))")
      .eq("oportunidades.comercial_id", perfil.id)
      .gte("realizada_at", `${inicioMes}T00:00:00`)
      .lte("realizada_at", `${finMes}T23:59:59`)
      .not("nota", "like", "[Histórico%")
      .order("realizada_at", { ascending: false })
      .limit(400),
    supabase
      .from("ventas")
      .select("id, fecha_venta, monto_total, moneda, oportunidades!inner(comercial_id, cuentas(razon_social))")
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
    fecha: String(a.realizada_at).slice(0, 10),
    razonSocial:
      ((a.oportunidades as unknown as { cuentas: { razon_social: string } | null } | null)?.cuentas?.razon_social) ?? "Cuenta sin nombre",
  }));

  const ventas: VentaAgenda[] = (ventasData ?? []).map((v) => ({
    id: v.id,
    fecha: String(v.fecha_venta).slice(0, 10),
    monto: v.monto_total,
    moneda: v.moneda,
    razonSocial:
      ((v.oportunidades as unknown as { cuentas: { razon_social: string } | null } | null)?.cuentas?.razon_social) ?? "Cuenta sin nombre",
  }));

  const historial: Record<string, HistItem[]> = {};
  for (const h of histData ?? []) {
    if (!historial[h.oportunidad_id]) historial[h.oportunidad_id] = [];
    if (historial[h.oportunidad_id].length < 4) {
      historial[h.oportunidad_id].push({ tipo: h.tipo, nota: h.nota, fecha: String(h.realizada_at).slice(0, 10) });
    }
  }

  return (
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
  );
}
