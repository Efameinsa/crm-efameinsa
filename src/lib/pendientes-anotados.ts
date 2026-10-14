import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PENDIENTES ANOTADOS (buzón, Rubí PV1, 12-10-2026: «que me dé la opción de
 * agregar más pendientes como Importación, Llamada programada, Pendiente de
 * stock»). Son tareas propias (0028) con su tipo (0444): lo que el circuito no
 * ve solo —un repuesto que viene importado, un stock que falta, una llamada que
 * quedó para otro día— y que tiene que salir en el reporte hasta resolverse.
 * «Pendiente de cierre» y «Problema técnico» (buzón, Rubí, 12-10, 0449): los
 * anotaba como «Otro pendiente» con «CIERRE -» o «PROBLEMA TECNICO -» delante.
 */
export const TIPOS_PENDIENTE = [
  "importacion",
  "llamada_programada",
  "pendiente_stock",
  "pendiente_cierre",
  "problema_tecnico",
  "otro",
] as const;
export type TipoPendiente = (typeof TIPOS_PENDIENTE)[number];

export const ETIQUETA_TIPO_PENDIENTE: Record<TipoPendiente, string> = {
  importacion: "Importación",
  llamada_programada: "Llamada programada",
  pendiente_stock: "Pendiente de stock",
  pendiente_cierre: "Pendiente de cierre",
  problema_tecnico: "Problema técnico",
  otro: "Otro pendiente",
};

export interface PendienteAnotado {
  id: string;
  titulo: string;
  fecha: string;
  hora: string | null;
  tipo: TipoPendiente;
}

/** Los abiertos de una persona, del más antiguo al más nuevo. */
export async function pendientesAnotados(supabase: SupabaseClient, perfilId: string): Promise<PendienteAnotado[]> {
  const { data } = await supabase
    .from("tareas_agenda")
    .select("id, titulo, fecha, hora, tipo_pendiente")
    .eq("comercial_id", perfilId)
    .not("tipo_pendiente", "is", null)
    .eq("completada", false)
    .order("fecha")
    .limit(200);
  return ((data ?? []) as { id: string; titulo: string; fecha: string; hora: string | null; tipo_pendiente: TipoPendiente }[]).map(
    (t) => ({
      id: t.id,
      // Se guarda con el tipo adelante para que el calendario lo diga; acá ya va en su bloque.
      titulo: t.titulo.replace(`${ETIQUETA_TIPO_PENDIENTE[t.tipo_pendiente]}: `, ""),
      fecha: t.fecha,
      hora: t.hora ? t.hora.slice(0, 5) : null,
      tipo: t.tipo_pendiente,
    }),
  );
}

/**
 * Las tareas comunes del calendario que siguen sin hacer (sin tipo de
 * pendiente). Santos, 14-10: «que figuren como tareas pendientes, para ver esa
 * agenda como un macro de todo lo que tienen por hacer». Las con tipo ya salen
 * en pendientesAnotados; estas no salían en ningún lado del reporte.
 */
export async function tareasPendientesDelCalendario(
  supabase: SupabaseClient,
  perfilId: string,
): Promise<{ titulo: string; fecha: string; hora: string | null }[]> {
  const { data } = await supabase
    .from("tareas_agenda")
    .select("titulo, fecha, hora")
    .eq("comercial_id", perfilId)
    .is("tipo_pendiente", null)
    .eq("completada", false)
    .order("fecha")
    .limit(200);
  return ((data ?? []) as { titulo: string; fecha: string; hora: string | null }[]).map((t) => ({
    titulo: t.titulo,
    fecha: t.fecha,
    hora: t.hora ? t.hora.slice(0, 5) : null,
  }));
}

/** Uno por tipo, en el orden de TIPOS_PENDIENTE, solo los que tienen algo. */
export function pendientesPorTipo(lista: PendienteAnotado[]): { tipo: TipoPendiente; lista: PendienteAnotado[] }[] {
  return TIPOS_PENDIENTE.map((tipo) => ({ tipo, lista: lista.filter((p) => p.tipo === tipo) })).filter(
    (g) => g.lista.length > 0,
  );
}

/** Bloques para «5b» del reporte diario: uno por tipo, solo los que tienen algo. */
export function bloquesPendientesAnotados(
  lista: PendienteAnotado[],
): { titulo: string; filas: { cliente: string; detalle: string | null }[] }[] {
  return pendientesPorTipo(lista).map(({ tipo, lista: delTipo }) => ({
    titulo: ETIQUETA_TIPO_PENDIENTE[tipo],
    filas: delTipo.map((p) => ({
        // La fecha a la izquierda: el texto es lo largo y va donde hay lugar.
        cliente: `Para el ${p.fecha.split("-").reverse().join("/")}${p.hora ? ` ${p.hora}` : ""}`,
        detalle: p.titulo,
      })),
  }));
}
