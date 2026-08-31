"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ETAPAS_ATENCION,
  SELLO_DE_ETAPA,
  type ClasificacionAtencion,
  type EtapaAtencion,
  type TipoAtencion,
} from "@/lib/atenciones";

/**
 * Las acciones de la atención técnica (0131 y 0132).
 *
 * Una por paso del circuito que dictó el ing. Carlos, y ninguna que permita
 * saltearse el reparto de Central: registrar NO crea la atención, crea el
 * aviso en la bandeja. La atención nace cuando Central la devuelve al área.
 */

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{2}:\d{2}$/;

function refrescar(id?: string) {
  revalidatePath("/postventa");
  revalidatePath("/postventa/atenciones");
  revalidatePath("/postventa/agenda");
  if (id) revalidatePath(`/postventa/atenciones/${id}`);
}

/**
 * Registrar y DERIVAR. Es el cambio que pidió Lesly el 31-08: lo que registra
 * postventa va a la bandeja de Central, que decide si vuelve al área o si es de
 * un comercial. No devuelve una atención porque todavía no hay ninguna.
 */
export async function registrarAtencion(datos: {
  cuentaId: string;
  tipo: TipoAtencion;
  detalle: string;
  equipoId?: string | null;
  serie?: string | null;
  codigoError?: string | null;
}): Promise<{ error: string | null; codigo?: string; repetido?: boolean }> {
  if (!datos.cuentaId) return { error: "Falta el cliente: Central no puede derivar un caso sin cliente" };
  if (datos.detalle.trim().length < 10) {
    return { error: "Escriba qué le pasa al equipo: es lo que va a leer Central para derivarlo" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_atencion_postventa", {
    p_cuenta: datos.cuentaId,
    p_tipo: datos.tipo,
    p_detalle: datos.detalle.trim(),
    p_equipo: datos.equipoId ?? null,
    p_serie: datos.serie?.trim() || null,
    p_codigo_error: datos.codigoError?.trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/central");
  refrescar();
  const r = data as { codigo: string; repetido: boolean };
  return { error: null, codigo: r.codigo, repetido: r.repetido };
}

/**
 * Verificar la garantía: el primer condicional del circuito.
 *
 * No se pregunta, se lee del parque instalado y se deja escrito con fecha —
 * para que dentro de seis meses se sepa qué se decidió y con qué dato, y no
 * haya que volver a deducirlo.
 */
export async function verificarGarantia(atencionId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("atenciones")
    .select("id, equipo_id, etapa")
    .eq("id", atencionId)
    .maybeSingle();
  if (!a) return { error: "Esa atención no existe" };
  if (!a.equipo_id) return { error: "Primero hay que identificar el equipo por su número de serie" };

  const { data: g, error: eg } = await supabase.rpc("garantia_del_equipo", { p_equipo: a.equipo_id });
  if (eg) return { error: eg.message };
  const info = g as { en_garantia: boolean; hizo_preventivo: boolean };

  const { error } = await supabase
    .from("atenciones")
    .update({
      en_garantia: info.en_garantia,
      hizo_preventivo: info.hizo_preventivo,
      garantia_verificada_at: new Date().toISOString(),
    })
    .eq("id", atencionId);
  if (error) return { error: error.message };
  refrescar(atencionId);
  return { error: null };
}

/** Diagnóstico: qué le pasa y, sobre todo, quién paga. */
export async function diagnosticar(datos: {
  atencionId: string;
  clasificacion: ClasificacionAtencion;
  detalle: string;
}): Promise<{ error: string | null }> {
  if (datos.detalle.trim().length < 5) return { error: "Escriba el diagnóstico, aunque sea en una línea" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("atenciones")
    .update({
      clasificacion: datos.clasificacion,
      detalle: datos.detalle.trim(),
      etapa: "diagnostico",
      diagnosticado_at: new Date().toISOString(),
    })
    .eq("id", datos.atencionId);
  if (error) return { error: error.message };
  refrescar(datos.atencionId);
  return { error: null };
}

/**
 * Planificación: día, hora y técnico.
 *
 * Es la vista que Lesly validó sin cambios —«está bien, más orientado a su
 * información de él como gestión, porque lo va a poner en el calendario»— y la
 * que después alimenta la orden al almacén.
 */
export async function programarAtencion(datos: {
  atencionId: string;
  fecha: string;
  hora?: string | null;
  tecnico?: string | null;
}): Promise<{ error: string | null }> {
  if (!RE_FECHA.test(datos.fecha)) return { error: "Fecha inválida" };
  if (datos.hora && !RE_HORA.test(datos.hora)) return { error: "Hora inválida" };
  if (!datos.tecnico?.trim()) return { error: "Diga qué técnico va: sin eso la orden no sirve" };

  // La hora se guarda en hora de Lima, no en la del servidor (que corre en UTC).
  const cuando = `${datos.fecha}T${datos.hora ?? "09:00"}:00-05:00`;
  const supabase = await createClient();
  const { error } = await supabase
    .from("atenciones")
    .update({
      programada_at: cuando,
      tecnico: datos.tecnico.trim(),
      etapa: "planificacion",
    })
    .eq("id", datos.atencionId);
  if (error) return { error: error.message };
  refrescar(datos.atencionId);
  return { error: null };
}

/**
 * Avanzar de etapa, con su sello de tiempo.
 *
 * Se avanza de a un paso y nunca hacia atrás: el circuito es una carrera de
 * postas, y saltarse la conformidad para cerrar antes es justo lo que hace que
 * después nadie sepa si el cliente quedó conforme.
 */
export async function avanzarAtencion(datos: {
  atencionId: string;
  hasta: EtapaAtencion;
  conformidadNombre?: string | null;
  conformidadDoc?: string | null;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("atenciones")
    .select("etapa, en_garantia, clasificacion, programada_at")
    .eq("id", datos.atencionId)
    .maybeSingle();
  if (!a) return { error: "Esa atención no existe" };

  const desde = ETAPAS_ATENCION.indexOf(a.etapa as EtapaAtencion);
  const hasta = ETAPAS_ATENCION.indexOf(datos.hasta);
  if (hasta < 0) return { error: "Etapa desconocida" };
  if (hasta <= desde) return { error: "La atención ya pasó por esa etapa" };
  if (hasta > desde + 1) return { error: "Hay que avanzar de a un paso: no se saltea ninguna etapa" };

  // Los frenos que hacen que el dato signifique algo.
  if (datos.hasta === "diagnostico" && !a.clasificacion) {
    return { error: "Antes del diagnóstico hay que decir si es garantía, preventivo, correctivo o facturable" };
  }
  if (datos.hasta === "atencion" && !a.programada_at) {
    return { error: "Primero hay que programarla: día, hora y técnico" };
  }
  if (datos.hasta === "conformidad" && !datos.conformidadNombre?.trim()) {
    return { error: "La conformidad la firma el cliente: escriba quién la dio" };
  }

  const cambios: Record<string, unknown> = { etapa: datos.hasta };
  const sello = SELLO_DE_ETAPA[datos.hasta];
  if (sello) cambios[sello as string] = new Date().toISOString();
  if (datos.hasta === "conformidad") {
    cambios.conformidad_nombre = datos.conformidadNombre?.trim();
    cambios.conformidad_doc = datos.conformidadDoc?.trim() || null;
  }

  const { error } = await supabase.from("atenciones").update(cambios).eq("id", datos.atencionId);
  if (error) return { error: error.message };
  refrescar(datos.atencionId);
  return { error: null };
}

/** Cerrar la atención: el estatus que él dijo que faltaba. */
export async function cerrarAtencion(datos: {
  atencionId: string;
  resultado: "resuelto" | "no_procede" | "derivado";
  motivo: string;
}): Promise<{ error: string | null }> {
  if (datos.motivo.trim().length < 10) {
    return { error: "Escriba en qué quedó: es lo que se va a leer cuando el cliente vuelva a llamar" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("atenciones")
    .update({
      etapa: "cierre",
      resultado: datos.resultado,
      motivo_cierre: datos.motivo.trim(),
      cerrado_at: new Date().toISOString(),
    })
    .eq("id", datos.atencionId);
  if (error) return { error: error.message };
  refrescar(datos.atencionId);
  return { error: null };
}

/**
 * Lo que la atención descubrió que hay para vender.
 *
 * «El técnico le indica que hay un repuesto por vender (…) inmediatamente me
 * aparece a mí como postventa que hay algo por vender, y cotizo mi presupuesto
 * de mantenimiento preventivo y cotizo mi repuesto.»
 *
 * No se crea la oportunidad desde acá: se avisa a Central, que es quien reparte
 * (regla de Lesly, 31-08). Lo que cambia respecto de un aviso cualquiera es que
 * llega con el equipo, la serie y lo que vio el técnico ya escritos.
 */
export async function avisarVentaDeLaAtencion(datos: {
  atencionId: string;
  tipo: "solicitud_repuesto" | "solicitud_mantenimiento";
  detalle: string;
}): Promise<{ error: string | null; codigo?: string }> {
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("atenciones")
    .select("cuenta_id, equipo_id, equipo_texto")
    .eq("id", datos.atencionId)
    .maybeSingle();
  if (!a?.cuenta_id) return { error: "La atención no tiene cliente" };

  const { data, error } = await supabase.rpc("registrar_atencion_postventa", {
    p_cuenta: a.cuenta_id,
    p_tipo: datos.tipo,
    p_detalle: datos.detalle.trim(),
    p_equipo: a.equipo_id,
    p_serie: null,
    p_codigo_error: null,
  });
  if (error) return { error: error.message };
  revalidatePath("/central");
  refrescar(datos.atencionId);
  return { error: null, codigo: (data as { codigo: string }).codigo };
}
