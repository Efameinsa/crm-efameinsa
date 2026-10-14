import type Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdjuntoGuardado } from "@/lib/asistente/adjuntos";

/**
 * EL HISTORIAL DEL ASISTENTE (0479): lo que se guarda para auditar y lo que
 * el servidor necesita para seguir una conversación.
 *
 * Se escribe con la llave de servicio porque las tablas no le dan permiso de
 * escritura a nadie más: el historial no se puede editar ni borrar desde el
 * CRM. Este archivo solo escribe en esas dos tablas.
 *
 * EL HILO VIVE ACÁ, NO EN EL NAVEGADOR. Cada pregunta guarda en `turno` lo que
 * agregó a la conversación con el modelo (la pregunta, las consultas y sus
 * resultados, la respuesta). Para la siguiente pregunta se rearman los turnos
 * en orden. El navegador solo manda el id de la conversación, y se comprueba
 * que sea de quien pregunta.
 */

/** Tope de preguntas por conversación. Más allá, se pide empezar otra. */
export const MAX_PREGUNTAS = 25;

export type Turno = Anthropic.Beta.BetaMessageParam[];

export interface Hilo {
  id: string;
  turnos: Turno;
  preguntas: number;
}

/** Trae la conversación si es de esta persona; si no existe o no es suya, null. */
export async function cargarHilo(conversacionId: string, usuarioId: string): Promise<Hilo | null> {
  const db = createAdminClient();
  const { data: conv } = await db
    .from("asistente_conversaciones")
    .select("id, usuario_id")
    .eq("id", conversacionId)
    .maybeSingle();
  if (!conv || conv.usuario_id !== usuarioId) return null;
  const { data: filas } = await db
    .from("asistente_mensajes")
    .select("turno, estado")
    .eq("conversacion_id", conversacionId)
    .order("id", { ascending: true });
  // Solo los turnos que terminaron bien entran al hilo: uno cortado a la mitad
  // dejaría una consulta sin su resultado y la API lo rechaza.
  const buenos = (filas ?? []).filter((f) => f.estado === "ok" && Array.isArray(f.turno));
  return {
    id: conv.id,
    turnos: buenos.flatMap((f) => f.turno as Turno),
    preguntas: (filas ?? []).length,
  };
}

export interface PreguntaGuardada {
  pregunta: string;
  adjuntos: string[];
  respuesta: string | null;
  estado: string;
  error: string | null;
  consultas: { herramienta: string; argumentos: Record<string, unknown>; resumen: string }[];
}

/**
 * Lo que la ventana necesita para volver a mostrar una conversación después
 * de recargar la página (Santos, 14-10: «cada vez que se actualiza se pierde el
 * historial»). Solo si es de quien la pide; si no, null.
 */
export async function preguntasDe(conversacionId: string, usuarioId: string): Promise<PreguntaGuardada[] | null> {
  const db = createAdminClient();
  const { data: conv } = await db
    .from("asistente_conversaciones")
    .select("id, usuario_id")
    .eq("id", conversacionId)
    .maybeSingle();
  if (!conv || conv.usuario_id !== usuarioId) return null;
  const { data: filas } = await db
    .from("asistente_mensajes")
    .select("pregunta, adjuntos, respuesta, estado, error, consultas")
    .eq("conversacion_id", conversacionId)
    .order("id", { ascending: true });
  return (filas ?? []).map((f) => ({
    pregunta: f.pregunta as string,
    adjuntos: ((f.adjuntos as AdjuntoGuardado[] | null) ?? []).map((a) => a.nombre),
    respuesta: f.respuesta as string | null,
    estado: f.estado as string,
    error: f.error as string | null,
    consultas: (f.consultas as PreguntaGuardada["consultas"] | null) ?? [],
  }));
}

export async function crearConversacion(usuarioId: string, titulo: string): Promise<string> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("asistente_conversaciones")
    .insert({ usuario_id: usuarioId, titulo: titulo.slice(0, 120) })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo abrir la conversación: ${error?.message ?? "sin respuesta"}`);
  return data.id as string;
}

export interface Registro {
  conversacionId: string;
  usuarioId: string;
  rol: string;
  alcance: string;
  pregunta: string;
  /** Lo que adjuntó (0485): nombre, tipo y dónde quedó la copia. */
  adjuntos: AdjuntoGuardado[];
  respuesta: string | null;
  estado: "ok" | "error" | "rechazo" | "corte";
  error?: string | null;
  consultas: { herramienta: string; argumentos: Record<string, unknown>; resumen: string; ms: number }[];
  turno: Turno | null;
  modelo: string;
  uso: { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number; costo: number };
  msPrimerTexto: number | null;
  msTotal: number;
}

/**
 * Anota la pregunta. Si falla, no se le rompe la respuesta a nadie: se avisa
 * en el log del servidor y listo.
 */
export async function registrar(r: Registro): Promise<void> {
  try {
    const db = createAdminClient();
    const { error } = await db.from("asistente_mensajes").insert({
      conversacion_id: r.conversacionId,
      usuario_id: r.usuarioId,
      rol: r.rol,
      alcance: r.alcance,
      pregunta: r.pregunta,
      adjuntos: r.adjuntos,
      respuesta: r.respuesta,
      estado: r.estado,
      error: r.error ?? null,
      consultas: r.consultas,
      turno: r.turno,
      modelo: r.modelo,
      tokens_entrada: r.uso.entrada,
      tokens_salida: r.uso.salida,
      tokens_cache_lectura: r.uso.cacheLectura,
      tokens_cache_escritura: r.uso.cacheEscritura,
      costo_usd: Number(r.uso.costo.toFixed(5)),
      ms_primer_texto: r.msPrimerTexto,
      ms_total: r.msTotal,
    });
    if (error) console.error("asistente: no se pudo registrar la pregunta:", error.message);
    await db
      .from("asistente_conversaciones")
      .update({ actualizada_at: new Date().toISOString() })
      .eq("id", r.conversacionId);
  } catch (e) {
    console.error("asistente: no se pudo registrar la pregunta:", e instanceof Error ? e.message : e);
  }
}
