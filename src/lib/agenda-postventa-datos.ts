import type { SupabaseClient } from "@supabase/supabase-js";
import { puedeVerPrecios, sinPrecios, veTodoPostventa, type ServicioPostventa } from "@/lib/postventa";
import {
  eventoDeAtencion,
  eventoDeCaso,
  eventoDeTarea,
  eventoDeVisita,
  eventosDePedido,
  type CasoAgendable,
  type EventoCalendario,
  type TareaAgendable,
} from "@/lib/calendario-postventa";

/**
 * Todo lo que el área tiene con fecha entre dos días: despachos y puestas en
 * marcha de los pedidos, casos con próxima acción, atenciones programadas,
 * tareas propias y visitas a la planta.
 *
 * Lo cargaba solo la agenda; desde el 21-09 también lo lee el reporte diario
 * (Carlos: «así como los comerciales tienen lo proyectado para el día
 * siguiente, que también aparezca: despachos, atenciones técnicas, llamadas»).
 * Una sola función para que el PDF y el calendario digan lo mismo.
 */
export async function cargarEventosPostventa(
  supabase: SupabaseClient,
  perfil: { id: string; rol: string; es_postventa?: boolean | null; hace_postventa?: boolean | null },
  desde: string,
  hasta: string,
): Promise<EventoCalendario[]> {
  const verPrecios = puedeVerPrecios(perfil);
  // El área ve todos los casos, estén en la cartera de quien estén (01-09).
  const verTodo = veTodoPostventa(perfil);
  let consultaCasos = supabase
    .from("oportunidades")
    .select(
      "id, etapa, intencion, tipo_postventa, proxima_accion, proxima_accion_at, proxima_accion_hora, cuentas(razon_social, departamento, distrito)",
    )
    .not("tipo_postventa", "is", null)
    .gte("proxima_accion_at", desde)
    .lte("proxima_accion_at", hasta)
    .limit(300);
  if (!verTodo) consultaCasos = consultaCasos.eq("comercial_id", perfil.id);

  const [{ data: pedidos }, { data: casos }, { data: tareas }, { data: programadas }, { data: visitas }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("*")
      .or(
        `and(fecha_despacho.gte.${desde},fecha_despacho.lte.${hasta}),and(puesta_en_marcha.gte.${desde},puesta_en_marcha.lte.${hasta})`,
      )
      .limit(400),
    consultaCasos,
    // Las tareas personales (0028): antes solo se veían en «Mi agenda», que
    // el área ya no tiene en su menú — Santos, 31-08, mirando la semana:
    // «se crean desde ahí pero se ven en otra pantalla, lo cual es absurdo».
    supabase
      .from("tareas_agenda")
      .select("id, titulo, fecha, hora, completada")
      .eq("comercial_id", perfil.id)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .limit(200),
    // Las atenciones con día y técnico, y quién viene a la planta (0238).
    supabase
      .from("atenciones")
      .select("id, tipo, programada_at, tecnico, cliente_texto, cerrado_at, cuentas(razon_social, departamento)")
      .gte("programada_at", `${desde}T00:00:00-05:00`)
      .lte("programada_at", `${hasta}T23:59:59-05:00`)
      .limit(300),
    supabase
      .from("visitas_planta")
      .select("id, empresa, persona, motivo, fecha, hora, cancelada_at")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .limit(100),
  ]);

  const listaPedidos = ((pedidos ?? []) as unknown as ServicioPostventa[]).map((s) => (verPrecios ? s : sinPrecios(s)));
  const eventosPedidos = listaPedidos.flatMap(eventosDePedido);
  const eventosCasos = ((casos ?? []) as unknown as {
    id: string;
    etapa: string;
    intencion: string | null;
    tipo_postventa: string | null;
    proxima_accion: string | null;
    proxima_accion_at: string | null;
    proxima_accion_hora: string | null;
    cuentas: { razon_social: string; departamento: string | null; distrito: string | null } | null;
  }[])
    .map((c): CasoAgendable => {
      const dep = (c.cuentas?.departamento ?? "").toUpperCase();
      return {
        id: c.id,
        tipo_postventa: c.tipo_postventa,
        intencion: c.intencion,
        etapa: c.etapa,
        proxima_accion: c.proxima_accion,
        proxima_accion_at: c.proxima_accion_at,
        proxima_accion_hora: c.proxima_accion_hora,
        cliente: c.cuentas?.razon_social ?? "Cliente sin nombre",
        zona: dep ? (dep === "LIMA" ? "lima" : "provincia") : null,
      };
    })
    .map(eventoDeCaso)
    .filter((e): e is EventoCalendario => e !== null);
  const eventosTareas = ((tareas ?? []) as unknown as TareaAgendable[]).map(eventoDeTarea);
  const eventosAtenciones = ((programadas ?? []) as unknown as {
    id: string; tipo: string; programada_at: string; tecnico: string | null; cliente_texto: string | null; cerrado_at: string | null;
    cuentas: { razon_social: string; departamento: string | null } | null;
  }[]).map((a) => {
    const dep = (a.cuentas?.departamento ?? "").toUpperCase();
    return eventoDeAtencion({
      id: a.id, tipo: a.tipo, programada_at: a.programada_at, tecnico: a.tecnico, cerrado_at: a.cerrado_at,
      cliente: a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre",
      zona: dep ? (dep === "LIMA" ? "lima" : "provincia") : null,
    });
  });
  const eventosVisitas = ((visitas ?? []) as unknown as Parameters<typeof eventoDeVisita>[0][]).map(eventoDeVisita);

  return [...eventosPedidos, ...eventosCasos, ...eventosTareas, ...eventosAtenciones, ...eventosVisitas];
}

/** Los eventos de un día, ordenados por hora (los sin hora al final). */
export function eventosDelDia(eventos: EventoCalendario[], fecha: string): EventoCalendario[] {
  return eventos
    .filter((e) => e.fecha === fecha)
    .sort((a, b) => (a.hora ?? "99:99").localeCompare(b.hora ?? "99:99") || a.cliente.localeCompare(b.cliente));
}
