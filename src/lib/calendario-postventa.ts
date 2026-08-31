import type { ServicioPostventa } from "@/lib/postventa";

/**
 * El calendario del área: qué técnico se mueve, adónde y qué día.
 *
 * Carlos lo pidió con estas palabras, y de paso rebautizó la pantalla: «el
 * lunes vamos a atender dos clientes, uno en La Victoria, otro en el Centro…
 * igual que ¿qué voy a hacer mañana, qué voy a hacer en la semana?». La agenda
 * era una lista ordenada por fecha; una lista no responde eso.
 *
 * LA REGLA QUE EVITA LAS SEIS AGENDAS DEL MANUAL: no existen los eventos
 * sueltos. Cada entrada nace de un pedido —de sus fechas comprometidas— o de un
 * caso. Si algo no está atado a un pedido o a un caso, no está en el calendario:
 * no hay dónde crear una cita huérfana, que es exactamente como el área terminó
 * con un cuaderno, un Excel y un grupo de WhatsApp llevando lo mismo.
 */

export type OrigenEvento = "pedido" | "caso" | "tarea";

export interface EventoCalendario {
  /** Único en la grilla: un mismo pedido aporta despacho y puesta en marcha. */
  clave: string;
  fecha: string;
  /** Hora comprometida, cuando la hay. Sin hora, el evento va a «por programar» del día. */
  hora: string | null;
  tipo: string;
  titulo: string;
  cliente: string;
  ubicacion: string | null;
  /** «lima» | «provincia» | null cuando no se sabe. */
  zona: string | null;
  href: string;
  origen: OrigenEvento;
  /** Ya ocurrió: se pinta apagado, pero no desaparece — el calendario también es memoria. */
  hecho: boolean;
}

/**
 * El color de cada tipo. Son clases completas y no interpoladas porque
 * Tailwind no ve las clases que se arman con plantillas.
 */
export const COLOR_EVENTO: Record<string, string> = {
  despacho: "border-l-[#7E1210] bg-[#7E1210]/5",
  puesta_en_marcha: "border-l-emerald-600 bg-emerald-50",
  mantenimiento: "border-l-sky-600 bg-sky-50",
  garantia: "border-l-amber-500 bg-amber-50",
  repuesto: "border-l-violet-600 bg-violet-50",
  caso: "border-l-slate-500 bg-slate-50",
  tarea: "border-l-neutral-400 bg-neutral-50",
};

export const ETIQUETA_EVENTO: Record<string, string> = {
  despacho: "Despacho",
  puesta_en_marcha: "Puesta en marcha",
  mantenimiento: "Mantenimiento",
  garantia: "Garantía",
  repuesto: "Repuesto",
  caso: "Atención",
  tarea: "Personal",
};

export function colorEvento(tipo: string): string {
  return COLOR_EVENTO[tipo] ?? COLOR_EVENTO.caso;
}

export function etiquetaEvento(tipo: string): string {
  return ETIQUETA_EVENTO[tipo] ?? "Atención";
}

/**
 * Las citas que salen de un pedido: el despacho y la puesta en marcha.
 *
 * Son las dos fechas que mueven gente. Los demás pasos del pedido —el pago, el
 * plano, la prueba del almacén— son estados, no citas: pretender agendarlos
 * llenaría el calendario de cosas que nadie va a ir a hacer a ningún lado.
 */
export function eventosDePedido(s: ServicioPostventa): EventoCalendario[] {
  const eventos: EventoCalendario[] = [];
  const cliente = s.cliente_texto ?? "Cliente sin nombre";
  const base = {
    cliente,
    ubicacion: s.ubicacion,
    zona: s.modalidad,
    href: `/postventa/pedidos/${s.id}`,
    origen: "pedido" as const,
    hora: null,
  };

  if (s.fecha_despacho) {
    eventos.push({
      ...base,
      clave: `${s.id}-despacho`,
      fecha: s.fecha_despacho,
      tipo: "despacho",
      titulo: s.despachado_at ? "Despachado" : "Despacho",
      hecho: s.despachado_at != null,
    });
  }
  if (s.puesta_en_marcha) {
    eventos.push({
      ...base,
      clave: `${s.id}-puesta`,
      fecha: s.puesta_en_marcha,
      tipo: "puesta_en_marcha",
      // En provincia la puesta en marcha suele ser por videollamada: no se
      // manda un técnico y eso cambia cómo se planifica la semana.
      titulo: s.modalidad === "provincia" ? "Puesta en marcha (remota)" : "Puesta en marcha",
      hecho: s.cerrado_at != null || s.completado,
    });
  }
  return eventos;
}

export interface CasoAgendable {
  id: string;
  tipo_postventa: string | null;
  intencion: string | null;
  etapa: string;
  proxima_accion: string | null;
  proxima_accion_at: string | null;
  proxima_accion_hora: string | null;
  cliente: string;
  zona: string | null;
}

/** La cita de un caso: lo que el área se comprometió a hacer y cuándo. */
export function eventoDeCaso(c: CasoAgendable): EventoCalendario | null {
  if (!c.proxima_accion_at) return null;
  return {
    clave: `caso-${c.id}`,
    fecha: c.proxima_accion_at,
    hora: c.proxima_accion_hora ? c.proxima_accion_hora.slice(0, 5) : null,
    tipo: c.tipo_postventa ?? "caso",
    titulo: c.proxima_accion ?? "Atención programada",
    cliente: c.cliente,
    ubicacion: null,
    zona: c.zona,
    href: `/comercial/oportunidades/${c.id}`,
    origen: "caso",
    hecho: c.etapa === "venta" || c.etapa === "rechazada",
  };
}

/**
 * Los pedidos que no tienen ni una fecha: la franja «por programar».
 *
 * Van ARRIBA del calendario y no escondidos al final, porque son el trabajo que
 * desaparece sin que nadie lo note. Cuando esta pantalla se miró el 27-08 había
 * 57 filas así.
 */
export function sinFecha(pedidos: ServicioPostventa[]): ServicioPostventa[] {
  return pedidos.filter((s) => !s.completado && !s.fecha_despacho && !s.puesta_en_marcha);
}

/** Agrupa por día, con las horas primero y lo sin hora después. */
export function agruparPorDia(eventos: EventoCalendario[]): Map<string, EventoCalendario[]> {
  const mapa = new Map<string, EventoCalendario[]>();
  for (const e of eventos) {
    const dia = mapa.get(e.fecha);
    if (dia) dia.push(e);
    else mapa.set(e.fecha, [e]);
  }
  for (const dia of mapa.values()) {
    dia.sort((a, b) => (a.hora ?? "99:99").localeCompare(b.hora ?? "99:99"));
  }
  return mapa;
}

/**
 * El filtro por zona.
 *
 * Lima y provincia no son dos etiquetas: son dos formas distintas de planificar
 * —una es mandar un técnico en la mañana, la otra es coordinar una videollamada
 * con el cliente y un transportista—. Lo que no tiene zona conocida se muestra
 * siempre: esconder trabajo real por un dato que nadie cargó es peor que
 * mostrarlo de más.
 */
export function filtrarPorZona(eventos: EventoCalendario[], zona: string): EventoCalendario[] {
  if (zona !== "lima" && zona !== "provincia") return eventos;
  return eventos.filter((e) => e.zona === zona || e.zona == null);
}

export interface TareaAgendable {
  id: string;
  titulo: string;
  fecha: string;
  hora: string | null;
  completada: boolean;
}

/**
 * La tarea personal como evento del calendario del área.
 *
 * No es un evento suelto: sigue siendo la misma fila de `tareas_agenda` que
 * ya existía (0028) — sencillamente hasta el 31-08 solo se veía en «Mi
 * agenda» y no donde el área realmente mira el día (Santos: «se crean desde
 * ahí pero se ven en otra pantalla, lo cual es absurdo»). Se edita en el
 * mismo sitio de siempre: el enlace lleva a «Mi agenda», no a una pantalla
 * nueva que habría que construir dos veces.
 */
export function eventoDeTarea(t: TareaAgendable): EventoCalendario {
  return {
    clave: `tarea-${t.id}`,
    fecha: t.fecha,
    hora: t.hora,
    tipo: "tarea",
    titulo: t.titulo,
    cliente: "Personal",
    ubicacion: null,
    zona: null,
    href: "/comercial/agenda",
    origen: "tarea",
    hecho: t.completada,
  };
}
