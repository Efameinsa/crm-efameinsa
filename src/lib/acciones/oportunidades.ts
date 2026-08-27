"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EtapaOportunidad } from "@/types/database";

const TIPOS_ACTIVIDAD = [
  "llamada",
  "whatsapp",
  "email",
  "visita",
  "reunion_online",
  "showroom",
  "filtro",
  "nota",
  "otro",
] as const;

// R11: registrar una gestión debe tomar ≤15 s — un solo POST hace todo:
// guarda la actividad y actualiza la próxima acción de la oportunidad.
export async function registrarActividad(datos: {
  oportunidadId: string;
  tipo: (typeof TIPOS_ACTIVIDAD)[number];
  nota: string;
  resultadoId?: number | null;
  proximaAccion: string;
  proximaAccionAt: string | null;
  proximaAccionHora?: string | null;
  // Rechazo: única vía para BORRAR la próxima acción desde acá (la
  // oportunidad se cierra, no queda nada que agendar).
  limpiarProximaAccion?: boolean;
  // Metadatos de archivos YA subidos al bucket 'adjuntos' por el cliente
  // (reunión 19-08: PDF/Word/fotos visibles en la ficha). Máximo 5.
  adjuntos?: { path: string; nombre: string; tipo: string; tamano: number }[];
}): Promise<{ error: string | null }> {
  if (!TIPOS_ACTIVIDAD.includes(datos.tipo)) {
    return { error: "Tipo de actividad inválido" };
  }
  if (datos.proximaAccionAt && !/^\d{4}-\d{2}-\d{2}$/.test(datos.proximaAccionAt)) {
    return { error: "Fecha de la próxima acción inválida" };
  }
  if (datos.proximaAccionHora && !/^\d{2}:\d{2}$/.test(datos.proximaAccionHora)) {
    return { error: "Hora de la próxima acción inválida" };
  }
  const adjuntos = (datos.adjuntos ?? []).slice(0, 5).map((a) => ({
    path: String(a.path).slice(0, 300),
    nombre: String(a.nombre).slice(0, 120),
    tipo: String(a.tipo).slice(0, 100),
    tamano: Number(a.tamano) || 0,
  }));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const accionRegistrada = datos.limpiarProximaAccion ? "" : datos.proximaAccion.trim();

  const { error: errorActividad } = await supabase.from("actividades").insert({
    oportunidad_id: datos.oportunidadId,
    tipo: datos.tipo,
    nota: datos.nota || null,
    resultado_id: datos.resultadoId ?? null,
    realizada_por: user.id,
    adjuntos,
    // Copia histórica para el historial (migración 0056): a qué se comprometió
    // el comercial en ESTA gestión, aunque después la próxima acción cambie.
    proxima_accion: accionRegistrada || null,
    proxima_accion_at: datos.limpiarProximaAccion ? null : datos.proximaAccionAt,
    proxima_accion_hora: datos.limpiarProximaAccion || !datos.proximaAccionAt ? null : datos.proximaAccionHora ?? null,
  });
  if (errorActividad) return { error: errorActividad.message };

  // 24-08: ANTES esto pisaba siempre proxima_accion/proxima_accion_at con lo
  // que llegara, aunque llegara vacío. Consecuencia real (prueba de Darwin del
  // 23-08 sobre Lavandería Buenos Aires): registró la gestión con "llamar el
  // 29/08", el formulario se limpió y una segunda pasada con el formulario en
  // blanco dejó la oportunidad en proxima_accion = null — la tarea nunca llegó
  // a la agenda. Ahora una gestión SIN próxima acción no borra la que ya
  // estaba agendada; para quitarla está el panel de la agenda
  // (reprogramarAccion) o el rechazo.
  const accion = datos.proximaAccion.trim();
  const parche: Record<string, string | null> = {};
  if (datos.limpiarProximaAccion) {
    parche.proxima_accion = null;
    parche.proxima_accion_at = null;
    parche.proxima_accion_hora = null;
  } else if (accion || datos.proximaAccionAt) {
    parche.proxima_accion = accion || null;
    parche.proxima_accion_at = datos.proximaAccionAt;
    // Sin fecha no hay hora que valga (misma regla que reprogramarAccion).
    parche.proxima_accion_hora = datos.proximaAccionAt ? datos.proximaAccionHora ?? null : null;
  }

  if (Object.keys(parche).length > 0) {
    // Supabase no falla cuando RLS filtra el update (afecta 0 filas): se
    // revisa el .select() de vuelta, igual que en reprogramarAccion.
    const { data, error: errorOportunidad } = await supabase
      .from("oportunidades")
      .update(parche)
      .eq("id", datos.oportunidadId)
      .select("id");
    if (errorOportunidad) return { error: errorOportunidad.message };
    if (!data || data.length === 0) {
      return { error: "La gestión quedó registrada, pero solo el dueño de la oportunidad puede programar la próxima acción" };
    }
  }

  revalidatePath("/comercial");
  revalidatePath("/comercial/agenda");
  revalidatePath(`/comercial/oportunidades/${datos.oportunidadId}`);
  return { error: null };
}

// Interés de compra (INT_COMPRA del Excel original), monto estimado y
// segmento — existían en el esquema desde B1 pero ninguna pantalla los
// editaba. Guardado optimista, sin botón "Guardar" aparte (mismo espíritu
// ≤15 s que el registro de actividad).
export async function calificarOportunidad(datos: {
  oportunidadId: string;
  intencion: "alto_potencial" | "medio_alto" | "medio" | "medio_bajo" | "bajo" | "sin_definir";
  montoEstimado: number | null;
  moneda: "PEN" | "USD";
  segmento: "industrial" | "semi_industrial" | null;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  // .select() de vuelta por lo mismo que en cambiarEtapa: sin esto, un update
  // filtrado por RLS pasa por bueno y la calificación parece guardada.
  const { data, error } = await supabase
    .from("oportunidades")
    .update({
      intencion: datos.intencion,
      monto_estimado: datos.montoEstimado,
      moneda: datos.moneda,
      segmento: datos.segmento,
    })
    .eq("id", datos.oportunidadId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Solo el dueño de la oportunidad puede calificarla" };
  }

  revalidatePath("/comercial", "layout");
  revalidatePath(`/comercial/oportunidades/${datos.oportunidadId}`);
  return { error: null };
}

const ETAPAS_MANUALES: EtapaOportunidad[] = [
  "asignada",
  "filtrada",
  "seguimiento",
  "potencial",
  "rechazada",
  "derivada",
];

// 'cotizada' y 'venta' no están acá: se alcanzan por el flujo de cotizador/venta
// (bloque B4), no por cambio manual de etapa.
export async function cambiarEtapa(datos: {
  oportunidadId: string;
  etapa: EtapaOportunidad;
  motivoRechazoId: number | null;
}): Promise<{ error: string | null }> {
  if (!ETAPAS_MANUALES.includes(datos.etapa)) {
    return { error: "Esa etapa no se cambia manualmente" };
  }
  if (datos.etapa === "rechazada" && !datos.motivoRechazoId) {
    return { error: "Seleccione el motivo del rechazo" };
  }

  const supabase = await createClient();
  // Con .select() de vuelta: Supabase NO devuelve error cuando RLS filtra el
  // update (afecta 0 filas) y la pantalla diría "Etapa actualizada" sin que se
  // haya movido nada. Misma lección que reprogramarAccion y registrarActividad.
  const { data, error } = await supabase
    .from("oportunidades")
    .update({
      etapa: datos.etapa,
      motivo_rechazo_id: datos.etapa === "rechazada" ? datos.motivoRechazoId : null,
      cerrada_at: datos.etapa === "rechazada" ? new Date().toISOString() : null,
    })
    .eq("id", datos.oportunidadId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Solo el dueño de la oportunidad puede cambiarle la etapa" };
  }

  revalidatePath("/comercial");
  revalidatePath("/comercial/oportunidades");
  revalidatePath(`/comercial/oportunidades/${datos.oportunidadId}`);
  return { error: null };
}

// Agenda: reprogramar la próxima acción (fecha y hora) desde el calendario —
// arrastrar a otro día o editar en el panel lateral. La hora es opcional
// (sin hora = todo el día). Supabase no falla cuando RLS filtra el update
// (afecta 0 filas), por eso se revisa el .select() de vuelta.
export async function reprogramarAccion(datos: {
  oportunidadId: string;
  fecha: string | null;
  hora: string | null;
}): Promise<{ error: string | null }> {
  if (datos.fecha !== null && !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) {
    return { error: "Fecha inválida" };
  }
  if (datos.hora !== null && !/^\d{2}:\d{2}$/.test(datos.hora)) {
    return { error: "Hora inválida" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("oportunidades")
    .update({ proxima_accion_at: datos.fecha, proxima_accion_hora: datos.fecha ? datos.hora : null })
    .eq("id", datos.oportunidadId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Solo el dueño de la oportunidad puede reprogramarla" };

  revalidatePath("/comercial/agenda");
  revalidatePath("/comercial");
  return { error: null };
}

/**
 * Fija (o quita, con fecha null) la fecha proyectada de cierre — el cuadro
 * semanal de potenciales del ing. Carlos (25-08): «si no lo cierras, lo pasas
 * al siguiente día y lo jalas». La base valida que sea el dueño o backoffice
 * (migración 0084).
 */
export async function proyectarCierre(
  oportunidadId: string,
  fecha: string | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("proyectar_cierre", {
    p_oportunidad: oportunidadId,
    p_fecha: fecha,
  });
  if (error) return { error: error.message };
  revalidatePath("/comercial/potenciales");
  revalidatePath("/gerencia/potenciales");
  return { error: null };
}
