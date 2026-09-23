import type { SupabaseClient } from "@supabase/supabase-js";
import { circuitoDe, puedeVerPrecios, sinPrecios, veTodoPostventa, type ServicioPostventa } from "@/lib/postventa";
import { ETIQUETA_TIPO_ATENCION, type TipoAtencion } from "@/lib/atenciones";
import { DIAS_AVISO_PREVENTIVO } from "@/lib/preventivo";
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

// ── ¿QUÉ ESTÁ PENDIENTE, POR TIPO? (ítem 6 de la reunión del 22-09) ─────────
//
// «El calendario está todo consolidado, pero en realidad está pendiente del
// despacho, pendiente de videollamadas, servicio técnico, pendiente de
// mantenimiento preventivo. Hay varios puntos que se tienen que ver acá»
// (Carlos, 22-09). El calendario contesta «¿cuándo?»; esto contesta «¿qué me
// falta?», sin fecha de por medio — un despacho SIN fecha nunca aparecería en
// ningún calendario, y es justo el que más urge programar.

export interface FilaPendiente {
  id: string;
  cliente: string;
  detalle: string | null;
  /** Desde cuándo espera (ISO), para poder ordenar por antigüedad. */
  desde: string | null;
  url: string;
}

export interface PendientesPostventa {
  despachosSinFecha: FilaPendiente[];
  despachosConFecha: FilaPendiente[];
  videollamadas: FilaPendiente[];
  puestasEnMarcha: FilaPendiente[];
  atencionesSinProgramar: FilaPendiente[];
  preventivosPorVencer: FilaPendiente[];
}

function sumarDiasIso(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Todo lo que el área tiene pendiente, agrupado por tipo — no por fecha.
 *
 * Se calcula aparte de `cargarEventosPostventa`: esa función solo trae lo que
 * YA tiene una fecha puesta, y el punto de este panel es precisamente lo que
 * todavía no la tiene (un despacho sin programar, una atención sin agendar).
 */
export async function pendientesDePostventa(supabase: SupabaseClient): Promise<PendientesPostventa> {
  const [{ data: pedidos }, { data: aProgramar }, preventivosPorVencer] = await Promise.all([
    // Postventa ve todo el trabajo del área, esté en la cartera de quien esté
    // (veTodoPostventa) — el mismo criterio que ya usa `cargarEventosPostventa`.
    supabase
      .from("servicios_postventa")
      .select(
        "id, cliente_texto, equipo, fecha_despacho, despacho_hora, despachado_at, puesta_en_marcha, modalidad, tipo_pedido, entrega_en, con_instalacion, preinstalacion_ok_at, cerrado_at, completado, created_at, informe_cierre_id, pedido_ejecutado_at",
      )
      .eq("completado", false)
      .is("cerrado_at", null)
      .limit(400),
    supabase
      .from("atenciones")
      .select("id, tipo, detalle, cliente_texto, solicitado_at, cuentas(razon_social)")
      .eq("etapa", "diagnostico")
      .is("cerrado_at", null)
      .order("solicitado_at", { ascending: true })
      .limit(100),
    preventivosPorOfrecer(supabase),
  ]);

  // Lo que Central todavía no lanzó no es trabajo del área (0237): el mismo
  // corte que El macro y el control, para que el reporte no cuente de más.
  const listaPedidos = ((pedidos ?? []) as unknown as (ServicioPostventa & { created_at: string | null })[]).filter(
    (s) => !s.informe_cierre_id || s.pedido_ejecutado_at,
  );
  // Las videollamadas que ya tienen apertura enviada al almacén (0281) no se
  // piden de nuevo: van en su propio bloque, por día.
  const { data: conApertura } = await supabase
    .from("aperturas_llamada")
    .select("servicio_id")
    .eq("tipo", "videollamada_preinstalacion")
    .is("anulada_at", null)
    .not("servicio_id", "is", null);
  const yaPedidas = new Set(((conApertura ?? []) as { servicio_id: string }[]).map((a) => a.servicio_id));

  const despachosPendientes = listaPedidos.filter((s) => s.despachado_at == null);
  const despachosSinFecha = despachosPendientes
    .filter((s) => !s.fecha_despacho)
    .map((s) => ({
      id: s.id,
      cliente: s.cliente_texto ?? "Cliente sin nombre",
      detalle: s.equipo,
      desde: s.created_at ?? null,
      url: `/postventa/pedidos/${s.id}`,
    }));
  const despachosConFecha = despachosPendientes
    .filter((s) => s.fecha_despacho)
    .map((s) => ({
      id: s.id,
      cliente: s.cliente_texto ?? "Cliente sin nombre",
      detalle: `${s.equipo ?? ""} · programado ${s.fecha_despacho}`.trim(),
      desde: s.fecha_despacho,
      url: `/postventa/pedidos/${s.id}`,
    }));

  // LIMA, EQUIPO, SIN VIDEOLLAMADA Y SIN PUESTA (Carlos, 22-09): una vez hecha
  // la puesta en marcha ya no tiene sentido pedirla — es la misma leniencia
  // que aplica `bloquesPedido` para no reabrir pedidos que avanzaron sin ella.
  const videollamadas = listaPedidos
    .filter((s) => {
      const circuito = circuitoDe(s);
      return (
        s.modalidad === "lima" &&
        circuito.esEquipo &&
        s.preinstalacion_ok_at == null &&
        s.puesta_en_marcha == null &&
        !yaPedidas.has(s.id)
      );
    })
    .map((s) => ({
      id: s.id,
      cliente: s.cliente_texto ?? "Cliente sin nombre",
      detalle: s.equipo,
      desde: s.despachado_at ?? s.fecha_despacho ?? null,
      url: `/postventa/pedidos/${s.id}`,
    }));

  // Despachado pero sin cerrar la puesta: en un repuesto sin instalación no
  // existe este paso (se entrega y se cierra), así que se descarta con el
  // mismo `circuitoDe` que usa el circuito del pedido.
  const puestasEnMarcha = listaPedidos
    .filter((s) => {
      const circuito = circuitoDe(s);
      if (circuito.esRepuesto && !circuito.conInstalacion) return false;
      return s.despachado_at != null && s.puesta_en_marcha == null;
    })
    .map((s) => ({
      id: s.id,
      cliente: s.cliente_texto ?? "Cliente sin nombre",
      detalle: s.equipo,
      desde: s.despachado_at,
      url: `/postventa/pedidos/${s.id}`,
    }));

  const atencionesSinProgramar = ((aProgramar ?? []) as unknown as {
    id: string;
    tipo: string;
    detalle: string | null;
    cliente_texto: string | null;
    solicitado_at: string | null;
    cuentas: { razon_social: string } | null;
  }[]).map((a) => ({
    id: a.id,
    cliente: a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre",
    detalle: `${ETIQUETA_TIPO_ATENCION[a.tipo as TipoAtencion] ?? a.tipo}${a.detalle ? ` · ${a.detalle}` : ""}`,
    desde: a.solicitado_at,
    url: `/postventa/atenciones/${a.id}`,
  }));

  return {
    despachosSinFecha,
    despachosConFecha,
    videollamadas,
    puestasEnMarcha,
    atencionesSinProgramar,
    preventivosPorVencer,
  };
}

/**
 * LOS PREVENTIVOS POR OFRECER (gerencia, 23-09-2026): «Cada 3 meses se debe
 * alertar para empezar el proceso de envío de propuestas y concluir cierres
 * antes de los 4 meses». La máquina nueva sube al parque con su preventivo a
 * los 4 meses (0277), así que el aviso va 30 días antes del vencimiento —antes
 * eran 15, que no alcanzaban para cotizar, esperar la OC y cerrar—. También
 * salen los ya vencidos: no se esconde lo que se pasó.
 *
 * Aparte de `pendientesDePostventa` para que el macro cuente lo mismo que la
 * agenda y el reporte diario sin traer todo lo demás.
 */
export async function preventivosPorOfrecer(supabase: SupabaseClient): Promise<FilaPendiente[]> {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const limite = sumarDiasIso(hoy, DIAS_AVISO_PREVENTIVO);
  const { data: equipos } = await supabase
    .from("equipos_instalados")
    .select("id, serie, modelo_texto, cliente_texto, proximo_mantenimiento, cuentas(razon_social)")
    .not("proximo_mantenimiento", "is", null)
    .lte("proximo_mantenimiento", limite)
    .order("proximo_mantenimiento", { ascending: true })
    .limit(200);

  const listaEquipos = (equipos ?? []) as unknown as {
    id: string;
    serie: string;
    modelo_texto: string | null;
    cliente_texto: string | null;
    proximo_mantenimiento: string;
    cuentas: { razon_social: string } | null;
  }[];
  // «SIN CASO»: si ya hay una atención abierta para esa máquina, avisar de
  // nuevo por el preventivo sería duplicar lo que postventa ya está viendo.
  const { data: conCasoAbierto } =
    listaEquipos.length === 0
      ? { data: [] as { equipo_id: string | null }[] }
      : await supabase
          .from("atenciones")
          .select("equipo_id")
          .in("equipo_id", listaEquipos.map((e) => e.id))
          .is("cerrado_at", null);
  const equiposConCaso = new Set((conCasoAbierto ?? []).map((a) => a.equipo_id).filter((x): x is string => x != null));

  return listaEquipos
    .filter((e) => !equiposConCaso.has(e.id))
    .map((e) => ({
      id: e.id,
      cliente: e.cuentas?.razon_social ?? e.cliente_texto ?? "Cliente sin nombre",
      detalle: `${e.modelo_texto ?? "Equipo"} · serie ${e.serie} · ${e.proximo_mantenimiento < hoy ? "venció" : "vence"} ${e.proximo_mantenimiento}`,
      desde: e.proximo_mantenimiento,
      url: `/postventa/equipos/${e.id}`,
    }));
}
