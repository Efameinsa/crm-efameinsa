"use server";

import { revalidatePath } from "next/cache";
import { ETAPAS_MANUALES } from "@/lib/etapas-oportunidad";
import { createClient } from "@/lib/supabase/server";
import { duenoDelExpediente, esRechazoDeRls, mensajeExpedienteAjeno } from "@/lib/expediente-ajeno";
import { marcarLeidasDeOportunidad } from "@/lib/acciones/notificaciones";
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
  if (errorActividad) {
    // EL MENSAJE CRUDO NO SE ENTIENDE. Cuando el expediente es de otra
    // persona, Postgres devuelve «new row violates row-level security policy
    // for table "actividades"» y la pantalla lo mostraba tal cual, en inglés.
    // El texto —y el camino de salida, que desde el 09-09 es «Pedir el
    // expediente» con código— vive en `expediente-ajeno`, compartido con las
    // otras puertas que dan contra la misma pared.
    if (esRechazoDeRls(errorActividad.message)) {
      return { error: mensajeExpedienteAjeno(await duenoDelExpediente(supabase, datos.oportunidadId)) };
    }
    return { error: errorActividad.message };
  }

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

  // Gestionar el prospecto ES atender el aviso que lo anunció: se apaga solo,
  // aunque la persona haya entrado por la agenda y nunca haya tocado la
  // campana (reclamo de Brenda del 29-08).
  await marcarLeidasDeOportunidad(datos.oportunidadId);

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
      // CERRADA_AT NO ES «SE CERRÓ», ES «NO SE VUELVE».
      //
      // `rechazada` y `derivada` llevan la fecha: ahí se acabó. `historico` la
      // lleva en NULL a propósito — el botón «Retomar» de la cartera (0155)
      // busca las archivadas SIN fecha de cierre, así que ponérsela las
      // dejaría archivadas para siempre y sin forma de volver. Y el resto de
      // etapas, que son abiertas, tampoco llevan fecha.
      cerrada_at:
        datos.etapa === "rechazada" || datos.etapa === "derivada" ? new Date().toISOString() : null,
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

/**
 * CERRAR UNA OPORTUNIDAD QUE YA SE VENDIÓ, CUANDO LA VENTA YA ESTÁ REGISTRADA.
 *
 * El hueco que encontró Santos el 08-09: «el combo obliga a poner algo,
 * ¿entonces qué tendría que poner?». Si la venta se registra desde la
 * cotización aceptada, la etapa se mueve sola y no hay nada que elegir. Pero
 * cuando la venta ya existe SIN haber salido de una cotización del CRM —el
 * cierre se emitió, o la venta se cargó de otro lado— no queda ningún botón
 * que pulsar: la oportunidad se queda abierta para siempre, o se cierra como
 * «Rechazada» con un motivo falso que va a parar al reporte de pérdidas.
 *
 * Medido antes de escribir esto: cinco oportunidades de los últimos noventa
 * días tienen su venta registrada y siguen en «seguimiento» o «potencial».
 * Dos de ellas ni siquiera tienen una cotización en el CRM.
 *
 * LA REGLA QUE LO HACE SEGURO: solo se puede si la oportunidad YA TIENE una
 * venta viva. No se crea ninguna venta acá —eso sigue siendo trabajo de
 * `registrar_venta`, que ata la cotización y calcula el importe del informe—,
 * así que no hay forma de inflar una cifra: la venta que se cuenta ya estaba
 * contada. Lo único que se corrige es la etapa, que había quedado atrás.
 *
 * Por eso `venta` puede seguir fuera de ETAPAS_MANUALES: no se llega por
 * elegirla en un desplegable, se llega por tener la venta hecha.
 */
export async function cerrarComoVendida(
  oportunidadId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: venta } = await supabase
    .from("ventas")
    .select("id")
    .eq("oportunidad_id", oportunidadId)
    .is("anulada_at", null)
    .limit(1)
    .maybeSingle();
  if (!venta) {
    return {
      error:
        "Esta oportunidad todavía no tiene una venta registrada. Regístrela desde la cotización aceptada, con «Registrar venta».",
    };
  }

  // Con .select() de vuelta: sin esto, un update filtrado por RLS afecta cero
  // filas y la pantalla diría que se cerró sin haberse movido nada.
  const { data, error } = await supabase
    .from("oportunidades")
    .update({ etapa: "venta", cerrada_at: new Date().toISOString(), motivo_rechazo_id: null })
    .eq("id", oportunidadId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Solo el dueño de la oportunidad puede cerrarla" };
  }

  revalidatePath("/comercial");
  revalidatePath("/comercial/oportunidades");
  revalidatePath(`/comercial/oportunidades/${oportunidadId}`);
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
  /**
   * CUÁL cotización se espera cerrar ese día. Carlos, 05-09: «el cliente tiene
   * 3 cotizaciones; eliges qué número estás proyectando cerrar para el lunes».
   * Opcional: sin ella la proyección toma la última enviada, como antes.
   */
  cotizacionId?: string | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("proyectar_cierre", {
    p_oportunidad: oportunidadId,
    p_fecha: fecha,
    p_cotizacion: cotizacionId ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/comercial/potenciales");
  revalidatePath("/gerencia/potenciales");
  return { error: null };
}

/**
 * «Retomar» (antes «Trabajar esta oportunidad»): la saca del archivo de los Excel y la devuelve
 * al trabajo del día (migración 0130).
 *
 * POR QUÉ EXISTE. El 31-08 se archivaron 20.443 oportunidades que venían de la
 * importación de los Excel (18 al 21-08) y que nadie había tocado dentro del
 * CRM. No se borró ninguna: siguen en la cartera de su comercial, con todo su
 * historial, y se buscan desde la pestaña «Histórico» de Mis oportunidades o
 * desde la ficha del cliente. Este botón es la puerta de vuelta — un clic, sin
 * pedirle permiso a nadie: es cartera propia, no hace falta código de
 * supervisor.
 *
 * La oportunidad vuelve a `seguimiento` con la próxima acción para HOY (hora
 * de Lima) y queda una nota en el historial diciendo quién la reactivó y
 * cuándo: si mañana aparece en el reporte de alguien, se sabe de dónde salió.
 *
 * Quién puede: el comercial dueño o gerencia/admin. Lo valida la base
 * (`trabajar_oportunidad_historica`), no esta función — la pantalla se protege
 * al abrirla una sola vez y el clic viaja después con la cookie que haya.
 */
export async function trabajarOportunidadHistorica(
  oportunidadId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("trabajar_oportunidad_historica", {
    p_oportunidad: oportunidadId,
  });
  if (error) return { error: error.message };

  revalidatePath("/comercial", "layout");
  revalidatePath(`/comercial/oportunidades/${oportunidadId}`);
  revalidatePath("/gerencia", "layout");
  return { error: null };
}

/**
 * PEDIR UN EXPEDIENTE QUE ES DE OTRO.
 *
 * Santos, 09-09: «debería aparecer un aviso que diga que este cliente es de
 * Ariana y por eso no lo puede gestionar, y un botón que pida cambiar para
 * ella con PIN». La regla entera —quién puede pedirlo, qué no se mueve, el
 * código y la firma— vive en la base (0202); acá solo se llama y se refresca
 * lo que cambió de manos.
 */
export async function pedirExpediente(
  oportunidadId: string,
  pin: string,
  motivo: string,
): Promise<{ error: string | null; mensaje?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pedir_expediente", {
    p_oportunidad_id: oportunidadId,
    p_pin: pin,
    p_motivo: motivo,
  });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };

  revalidatePath(`/comercial/oportunidades/${oportunidadId}`);
  revalidatePath("/comercial/mi-gestion");
  revalidatePath("/postventa");
  revalidatePath("/postventa/casos");
  return { error: null, mensaje: (data as string | null) ?? undefined };
}

/**
 * LA GESTIÓN Y EL RECHAZO, EN UN SOLO VIAJE.
 *
 * Ariana, 10-09: «se supone que cuando se marca eso, en el estado ya debe salir
 * rechazado». Debía, y la mayoría de las veces salía —130 de 140—, pero diez no:
 * la pantalla hacía DOS llamadas desde el navegador, una para guardar la
 * gestión y otra para cerrar la oportunidad, y entre las dos cabe una caída de
 * señal, una pestaña cerrada o un error que nadie vio. Cuando eso pasaba, la
 * gestión quedaba escrita —«no da respuesta, descartar»— y la oportunidad
 * seguía abierta y volvía a aparecer al día siguiente, sin motivo de rechazo.
 * Le pasó a C1, a C4 y a C5 entre el 26-08 y el 09-09.
 *
 * Acá las dos cosas viajan juntas y se resuelven en el servidor: o entran las
 * dos, o el rechazo falla ANTES de escribir nada y la pantalla lo dice. No se
 * copia ninguna de las dos —se llaman, que es la regla del repositorio—: la del
 * rechazo va primero, porque es la que puede negarse (sin motivo no hay
 * rechazo, y la etapa la valida ella).
 */
export async function registrarGestionYRechazar(datos: {
  gestion: Parameters<typeof registrarActividad>[0];
  motivoRechazoId: number;
}): Promise<{ error: string | null }> {
  if (!datos.motivoRechazoId) return { error: "Seleccione el motivo del rechazo" };

  const cierre = await cambiarEtapa({
    oportunidadId: datos.gestion.oportunidadId,
    etapa: "rechazada",
    motivoRechazoId: datos.motivoRechazoId,
  });
  if (cierre.error) return cierre;

  // Si esto fallara, la oportunidad ya quedó cerrada con su motivo —que es lo
  // que el comercial decidió— y lo que falta es la nota. Se dice cuál de las
  // dos mitades falló, en vez de un «no se pudo» que obligaría a repetir todo.
  const gestion = await registrarActividad(datos.gestion);
  if (gestion.error) {
    return { error: `La oportunidad quedó rechazada, pero no se pudo guardar la nota: ${gestion.error}` };
  }
  return { error: null };
}
