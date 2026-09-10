"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { avisarAtencionProgramadaN8n } from "@/lib/avisos-n8n";
import {
  ETAPAS_ATENCION,
  SE_COBRA,
  faltaDecirPorQueNoSeFactura,
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
  /**
   * Las fotos que mandó el cliente, ya subidas al bucket 'adjuntos'. Viajan en
   * el lead (0192): la de la placa es la que aclara la serie mal dictada por
   * teléfono, que es de donde salen los casos «sin equipo identificar».
   */
  adjuntos?: { path: string; nombre: string; tipo: string; tamano: number }[];
}): Promise<{
  error: string | null;
  codigo?: string;
  repetido?: boolean;
  /** Cuando ya existía: en qué anda el anterior y hace cuánto se registró (0206). */
  estado?: string;
  oportunidad?: string | null;
  minutos?: number;
}> {
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
    p_adjuntos: (datos.adjuntos ?? []).slice(0, 5).map((a) => ({
      path: String(a.path).slice(0, 300),
      nombre: String(a.nombre).slice(0, 120),
      tipo: String(a.tipo).slice(0, 100),
      tamano: Number(a.tamano) || 0,
    })),
  });
  if (error) return { error: error.message };

  revalidatePath("/central");
  refrescar();
  const r = data as {
    codigo: string;
    repetido: boolean;
    estado?: string;
    oportunidad?: string | null;
    minutos?: number;
  };
  return {
    error: null,
    codigo: r.codigo,
    repetido: r.repetido,
    estado: r.estado,
    oportunidad: r.oportunidad ?? null,
    minutos: r.minutos,
  };
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

/**
 * Vincular la máquina del cliente a la atención — el clic que pidió Carlos
 * (01-09): «me deberían salir aquí las diferentes series que tiene el
 * cliente. Y ahí yo contrasto con [la foto de la placa] y le doy clic → el
 * equipo está en garantía o no». Al vincular se verifica la garantía en el
 * acto y queda escrita con fecha.
 */
export async function vincularEquipoAtencion(
  atencionId: string,
  equipoId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: eq } = await supabase
    .from("equipos_instalados")
    .select("id, serie")
    .eq("id", equipoId)
    .maybeSingle();
  if (!eq) return { error: "Esa máquina no está en el parque instalado" };

  const { error } = await supabase.from("atenciones").update({ equipo_id: equipoId }).eq("id", atencionId);
  if (error) return { error: error.message };

  return verificarGarantia(atencionId);
}

/**
 * Fichar la máquina desde la propia atención (0181).
 *
 * La salida al callejón que reportó Lesly el 07-09: cuando el cliente no tiene
 * ninguna máquina en el parque, el panel de las series sale vacío y no había
 * nada que apretar. Ahora se registra la máquina acá mismo —con lo que el
 * cliente dice por teléfono— y queda vinculada con la garantía verificada, que
 * es exactamente lo que hacía el clic del panel.
 *
 * La serie es opcional a propósito: se pide siempre, pero la foto de la placa
 * llega cuando llega y la atención no puede esperar a eso. Es el mismo criterio
 * que «Registrar un caso» ya usaba desde el 28-08.
 */
export async function ficharEquipoDeLaAtencion(datos: {
  atencionId: string;
  serie?: string | null;
  modelo: string;
  fechaCompra?: string | null;
  garantiaMeses?: number | null;
  ubicacion?: string | null;
}): Promise<{ error: string | null }> {
  if (datos.modelo.trim().length < 3) {
    return { error: "Escriba el modelo de la máquina: es lo que se va a leer cuando el cliente vuelva a llamar" };
  }
  if (datos.fechaCompra && !RE_FECHA.test(datos.fechaCompra)) return { error: "La fecha de compra no es válida" };

  const supabase = await createClient();
  const { data: a } = await supabase
    .from("atenciones")
    .select("id, cuenta_id, equipo_id")
    .eq("id", datos.atencionId)
    .maybeSingle();
  if (!a) return { error: "Esa atención no existe" };
  if (a.equipo_id) return { error: "Esta atención ya tiene una máquina identificada" };
  if (!a.cuenta_id) return { error: "La atención no tiene cliente: primero hay que decir de quién es" };

  const { error } = await supabase.rpc("fichar_equipo", {
    p_cuenta: a.cuenta_id,
    p_serie: datos.serie?.trim() || null,
    p_modelo: datos.modelo.trim(),
    p_producto: null,
    p_fecha_compra: datos.fechaCompra || null,
    p_garantia_meses: datos.garantiaMeses ?? 24,
    p_ubicacion: datos.ubicacion?.trim() || null,
    p_atencion: datos.atencionId,
    p_registrado_en: "atencion",
  });
  if (error) return { error: error.message };

  refrescar(datos.atencionId);
  revalidatePath("/postventa/equipos");
  return { error: null };
}

/**
 * Seguir sin identificar la máquina (0181).
 *
 * Cuando no hay forma de saber de qué equipo habla el cliente, la atención
 * avanza igual y queda ESCRITO que la garantía no se pudo verificar. Se
 * registra el dato que falta en vez de inventar un «sin garantía» que después
 * nadie puede desmentir: `en_garantia` sigue en null a propósito.
 */
export async function seguirSinIdentificarEquipo(datos: {
  atencionId: string;
  motivo: string;
}): Promise<{ error: string | null }> {
  if (datos.motivo.trim().length < 5) {
    return { error: "Diga en una línea por qué no se pudo identificar la máquina" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("atenciones")
    .update({
      garantia_omitida_at: new Date().toISOString(),
      garantia_omitida_por: user?.id ?? null,
      garantia_omitida_motivo: datos.motivo.trim(),
    })
    .eq("id", datos.atencionId);
  if (error) return { error: error.message };

  refrescar(datos.atencionId);
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
      // NO se toca `detalle`: ahí vive lo que dijo el CLIENTE, y es prueba.
      // Hasta la 0185 el diagnóstico lo pisaba y el texto original se perdía
      // sin aviso — el hallazgo más grave del informe de UX del 08-09.
      diagnostico: datos.detalle.trim(),
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

  // LA ORDEN DE TRABAJO AL ALMACÉN (Carlos, 09-09): «de aquí le demos la orden
  // mediante el correo electrónico, desde CRM… y ya no le va a llenar nada, si
  // no todo está ahí». Va DESPUÉS de guardar y sin esperar nada: si n8n no
  // contesta, la atención queda programada igual.
  await avisarProgramacionAlAlmacen(supabase, datos.atencionId, cuando, datos.tecnico.trim());

  refrescar(datos.atencionId);
  return { error: null };
}

/**
 * Junta lo que el técnico necesita para no volver a preguntar nada y se lo
 * manda a n8n, que arma el correo. Todo lo que falle acá es silencioso a
 * propósito: es un aviso, no el registro.
 */
async function avisarProgramacionAlAlmacen(
  supabase: Awaited<ReturnType<typeof createClient>>,
  atencionId: string,
  cuando: string,
  tecnico: string,
): Promise<void> {
  try {
    const { data: a } = await supabase
      .from("atenciones")
      .select("id, tipo, detalle, en_garantia, equipo_id, equipo_texto, cliente_texto, cuentas(razon_social, num_doc)")
      .eq("id", atencionId)
      .maybeSingle();
    if (!a) return;
    const cuenta = a.cuentas as unknown as { razon_social: string; num_doc: string | null } | null;

    // El historial de ESA máquina, que es el otro pedido de la misma reunión.
    let antecedentes: { fecha: string; que: string }[] = [];
    let serie: string | null = null;
    if (a.equipo_id) {
      const [{ data: eq }, { data: antes }] = await Promise.all([
        supabase.from("equipos_instalados").select("serie, modelo_texto").eq("id", a.equipo_id).maybeSingle(),
        supabase
          .from("atenciones")
          .select("solicitado_at, diagnostico, trabajo_realizado, motivo_cierre")
          .eq("equipo_id", a.equipo_id)
          .neq("id", atencionId)
          .order("solicitado_at", { ascending: false })
          .limit(5),
      ]);
      serie = (eq as { serie?: string | null } | null)?.serie ?? null;
      antecedentes = (antes ?? []).map((x) => {
        const y = x as unknown as { solicitado_at: string; diagnostico: string | null; trabajo_realizado: string | null; motivo_cierre: string | null };
        return {
          fecha: String(y.solicitado_at).slice(0, 10),
          que: y.trabajo_realizado?.trim() || y.diagnostico?.trim() || y.motivo_cierre?.trim() || "Sin nota",
        };
      });
    }

    await avisarAtencionProgramadaN8n({
      atencionId,
      cliente: cuenta?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre",
      ruc: cuenta?.num_doc ?? null,
      tipo: String(a.tipo),
      equipo: a.equipo_texto ?? null,
      serie,
      enGarantia: a.en_garantia,
      reporto: a.detalle ?? null,
      cuando,
      tecnico,
      antecedentes,
    });
  } catch (e) {
    console.error("orden de trabajo: no se pudo armar el aviso:", e instanceof Error ? e.message : e);
  }
}

/**
 * Avanzar de etapa, con su sello de tiempo.
 *
 * Se avanza de a un paso y nunca hacia atrás: el circuito es una carrera de
 * postas, y saltarse la conformidad para cerrar antes es justo lo que hace que
 * después nadie sepa si el cliente quedó conforme.
 */
/**
 * Lo que el técnico hizo en el cliente (0182).
 *
 * La etapa «atención» era un botón de avance: se marcaba y no quedaba escrito
 * nada. Acá se escribe lo que el manual pide en ese momento —qué se hizo, qué
 * repuesto se usó y la lectura de ciclos— y con eso la atención pasa a pruebas.
 *
 * Los ciclos suben solos al parque instalado (trigger de la 0182): es en la
 * máquina donde sirven, comparados contra la lectura anterior.
 */
export async function registrarTrabajo(datos: {
  atencionId: string;
  trabajo: string;
  repuestos?: string | null;
  ciclos?: number | null;
}): Promise<{ error: string | null }> {
  if (datos.trabajo.trim().length < 10) {
    return { error: "Escriba qué se hizo en el cliente: es lo que se lee cuando la máquina vuelve a fallar" };
  }
  if (datos.ciclos != null && (!Number.isInteger(datos.ciclos) || datos.ciclos < 0)) {
    return { error: "La lectura de ciclos tiene que ser un número entero" };
  }

  const supabase = await createClient();
  const { data: a } = await supabase
    .from("atenciones")
    .select("etapa, equipo_id")
    .eq("id", datos.atencionId)
    .maybeSingle();
  if (!a) return { error: "Esa atención no existe" };
  if (a.etapa !== "atencion") return { error: "Esto se registra cuando la atención está en la etapa de atención" };

  const { error } = await supabase
    .from("atenciones")
    .update({
      trabajo_realizado: datos.trabajo.trim(),
      repuestos_usados: datos.repuestos?.trim() || null,
      ciclos: datos.ciclos ?? null,
      etapa: "pruebas",
      pruebas_at: new Date().toISOString(),
    })
    .eq("id", datos.atencionId);
  if (error) return { error: error.message };

  refrescar(datos.atencionId);
  revalidatePath("/postventa/equipos");
  return { error: null };
}

/**
 * El resultado de las pruebas (0182).
 *
 * Si la máquina NO quedó conforme, la atención se queda acá a propósito: no se
 * le pide al cliente que firme la conformidad de algo que no funciona. Vuelve
 * a planificación para programar otra visita.
 */
export async function registrarPruebas(datos: {
  atencionId: string;
  detalle: string;
  conforme: boolean;
  conformidadNombre?: string | null;
  conformidadDoc?: string | null;
}): Promise<{ error: string | null }> {
  if (datos.detalle.trim().length < 10) {
    return { error: "Escriba qué se probó y cómo respondió la máquina" };
  }
  if (datos.conforme && !datos.conformidadNombre?.trim()) {
    return { error: "La conformidad la firma el cliente: escriba quién la dio" };
  }

  const supabase = await createClient();
  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from("atenciones")
    .update({
      pruebas_detalle: datos.detalle.trim(),
      pruebas_conforme: datos.conforme,
      pruebas_at: ahora,
      // Conforme pasa con la firma del cliente. NO conforme vuelve a
      // planificación —hay que volver al cliente—, que es lo que pasa de
      // verdad: nadie firma la conformidad de una máquina que no quedó bien.
      ...(datos.conforme
        ? {
            etapa: "conformidad",
            conformidad_at: ahora,
            conformidad_nombre: datos.conformidadNombre?.trim(),
            conformidad_doc: datos.conformidadDoc?.trim() || null,
          }
        : { etapa: "planificacion", programada_at: null }),
    })
    .eq("id", datos.atencionId);
  if (error) return { error: error.message };

  refrescar(datos.atencionId);
  return { error: null };
}

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
  /** Por qué no se facturó, cuando el caso se cobraba y no hay cotización. */
  noFacturado?: string;
}): Promise<{ error: string | null; pideMotivoSinFacturar?: boolean }> {
  if (datos.motivo.trim().length < 10) {
    return { error: "Escriba en qué quedó: es lo que se va a leer cuando el cliente vuelva a llamar" };
  }
  const supabase = await createClient();

  // UN CASO QUE SE COBRA NO SE CIERRA EN SILENCIO (0189). El informe de UX del
  // 08-09 recorrió las nueve etapas de un caso marcado «se cobra» y lo cerró
  // con la conformidad firmada sin que el sistema pidiera nunca una
  // cotización: el área hace el trabajo, el cliente firma, y la venta se
  // pierde sin que nadie se entere.
  //
  // No se bloquea el cierre: se exige una respuesta. «Lo cubrió la garantía» o
  // «cortesía autorizada por gerencia» son razones legítimas — lo que no puede
  // pasar es que no haya ninguna.
  const { data: a } = await supabase
    .from("atenciones")
    .select("clasificacion, oportunidad_id")
    .eq("id", datos.atencionId)
    .maybeSingle();

  const seCobra = a?.clasificacion ? SE_COBRA[a.clasificacion as ClasificacionAtencion] : false;
  let sinFacturar: string | null = null;
  if (seCobra) {
    const { count } = a?.oportunidad_id
      ? await supabase
          .from("cotizaciones")
          .select("id", { count: "exact", head: true })
          .eq("oportunidad_id", a.oportunidad_id)
      : { count: 0 };

    if (
      faltaDecirPorQueNoSeFactura({
        clasificacion: a?.clasificacion as ClasificacionAtencion | null,
        cotizaciones: count ?? 0,
        motivo: datos.noFacturado,
      })
    ) {
      return {
        error:
          "Este caso se cobra y no tiene ninguna cotización. Cotícelo, o escriba por qué se cierra sin facturar.",
        pideMotivoSinFacturar: true,
      };
    }
    if (!count) sinFacturar = (datos.noFacturado ?? "").trim();
  }

  const { error } = await supabase
    .from("atenciones")
    .update({
      etapa: "cierre",
      resultado: datos.resultado,
      motivo_cierre: datos.motivo.trim(),
      no_facturado_motivo: sinFacturar,
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

/**
 * Marcar que una etapa NO APLICA en este caso, y seguir.
 *
 * Carlos, 09-09, sobre PERUBAR —una lavadora que sonaba, resuelta por
 * videollamada—: «ya no iría en planificación, porque ya no hay planificación…
 * le tienes que dar check, check, check para poder saltear». Hasta hoy el
 * circuito exigía pasar por las nueve, así que un caso resuelto por teléfono
 * se quedaba atorado en Diagnóstico.
 *
 * NO sella la etapa como cumplida: poner fecha de visita a una visita que
 * nunca ocurrió ensucia el dato con el que después se mide el área. Queda
 * anotado que no aplicó, con su motivo, y la tira lo pinta distinto (0198).
 */
export async function omitirEtapa(datos: {
  atencionId: string;
  etapa: EtapaAtencion;
  motivo: string;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("omitir_etapa_atencion", {
    p_atencion: datos.atencionId,
    p_etapa: datos.etapa,
    p_motivo: datos.motivo,
  });
  if (error) return { error: error.message };
  refrescar(datos.atencionId);
  return { error: null };
}
