"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notificar } from "@/lib/notificaciones";

export interface ItemCotizacion {
  /** null cuando el equipo todavía no está en el catálogo (migración 0062). */
  producto_id: string | null;
  /** Escrita a mano; obligatoria si no hay producto_id. */
  descripcion?: string | null;
  cantidad: number;
  precio_unitario: number;
  tier_aplicado?: string;
  /** Color con el que se ofrece este equipo, elegido en el buscador (migración
   *  0088). null/ausente = no se eligió: el PDF lista los disponibles. */
  color?: string | null;
}

/**
 * Los `raise exception` de plpgsql están escritos para que el comercial los
 * entienda; llegan tal cual salvo que el driver les anteponga el SQLSTATE.
 * Solo se quita ese prefijo — el mensaje puede tener dos puntos adentro.
 */
function limpiarError(mensaje: string): string {
  return mensaje.replace(/^[A-Z0-9]{5}:\s*/, "");
}

/**
 * El lugar de entrega es parte del documento pero NO viaja dentro de
 * `crear_cotizacion`: se escribe justo después, mientras la cotización sigue
 * siendo borrador.
 *
 * Se hace así para no cambiarle la firma a una función de la base que ya está
 * en uso desde tres sitios. El trigger de inmutabilidad lo congela igual en
 * cuanto el documento se envía (migración 0066), que es lo que importa.
 */
async function guardarEntrega(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cotizacionId: string,
  entregaLugar: string | null | undefined,
): Promise<void> {
  if (!entregaLugar) return;
  await supabase.from("cotizaciones").update({ entrega_lugar: entregaLugar }).eq("id", cotizacionId);
}

/** El estado de aprobación que calculó la BASE, que es el que manda. */
async function estadoAprobacionDe(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cotizacionId: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from("cotizaciones")
    .select("estado_aprobacion")
    .eq("id", cotizacionId)
    .maybeSingle();
  return data?.estado_aprobacion ?? undefined;
}

/**
 * Autoguarda la cotización que se está armando.
 *
 * POR QUÉ. Hasta el 27-08 el carrito vivía solo en la memoria del navegador y
 * recién tocaba la base al apretar «Crear cotización»: si sonaba el teléfono y
 * la comercial se iba a otra pantalla, los seis equipos se perdían. Ahora la
 * pantalla del cotizador siempre está editando un BORRADOR REAL — la fila nace
 * con el primer equipo y se reescribe con cada cambio.
 *
 * Se apoya en algo que ya era cierto: un borrador no gasta correlativo (el
 * número se asigna al enviarlo, migración 0064) y se puede borrar mientras no
 * haya salido al cliente (0065). Por eso crear la fila temprano no compromete
 * nada con contabilidad.
 *
 * NO avisa a gerencia. Ese aviso lo manda `finalizarCotizacion`, cuando la
 * comercial dice que terminó: si saliera desde acá, gerencia recibiría una
 * campanada por cada tecla.
 */
export async function guardarBorradorCotizacion(datos: {
  /** null la primera vez: el borrador todavía no existe. */
  cotizacionId: string | null;
  oportunidadId: string;
  serie: "EFAMEINSA" | "OPEN";
  items: ItemCotizacion[];
  condiciones: string;
  vigenciaDias: number;
  entregaLugar?: string | null;
}): Promise<{ error: string | null; cotizacionId: string | null; estadoAprobacion?: string }> {
  const supabase = await createClient();

  // Un borrador sin equipos no es un documento a medio hacer: no es nada. La
  // base tampoco lo acepta (ambas funciones exigen al menos un ítem), así que
  // quitar el último equipo BORRA el borrador y la pantalla vuelve a estar en
  // blanco. Volver a agregar uno crea otro — sin número de por medio, no cuesta.
  if (datos.items.length === 0) {
    if (!datos.cotizacionId) return { error: null, cotizacionId: null };
    const { error } = await eliminarCotizacion(datos.cotizacionId);
    return { error, cotizacionId: error ? datos.cotizacionId : null };
  }

  if (!datos.cotizacionId) {
    const { data, error } = await supabase.rpc("crear_cotizacion", {
      p_oportunidad_id: datos.oportunidadId,
      p_serie: datos.serie,
      p_items: datos.items,
      p_condiciones: datos.condiciones || null,
      p_vigencia_dias: datos.vigenciaDias,
    });
    if (error) return { error: limpiarError(error.message), cotizacionId: null };

    const cotizacionId = data as string;
    await guardarEntrega(supabase, cotizacionId, datos.entregaLugar);
    // NO se revalida nada acá. Se hacía al nacer el borrador —para que
    // apareciera en la lista de la oportunidad— y costaba caro: `revalidatePath`
    // dentro de una Server Action refresca EL ÁRBOL DE LA RUTA ACTUAL, y como
    // el autoguardado acababa de mover la URL a /cotizar/<id>, ese refresco
    // resolvía otro segmento de ruta y volvía a montar la pantalla entera. El
    // síntoma que reportó Darwin el 27-08: la ventana de equipos se cerraba
    // sola al elegir el PRIMER equipo (y solo el primero — es el único que crea
    // el borrador). La lista de la oportunidad se refresca igual al volver:
    // `volver()` hace router.refresh().
    return { error: null, cotizacionId, estadoAprobacion: await estadoAprobacionDe(supabase, cotizacionId) };
  }

  const { error } = await supabase.rpc("editar_cotizacion", {
    p_cotizacion_id: datos.cotizacionId,
    p_items: datos.items,
    p_condiciones: datos.condiciones || null,
    p_vigencia_dias: datos.vigenciaDias,
  });
  if (error) return { error: limpiarError(error.message), cotizacionId: datos.cotizacionId };

  await guardarEntrega(supabase, datos.cotizacionId, datos.entregaLugar);
  return {
    error: null,
    cotizacionId: datos.cotizacionId,
    estadoAprobacion: await estadoAprobacionDe(supabase, datos.cotizacionId),
  };
}

/**
 * La comercial terminó de armar el borrador.
 *
 * No escribe nada: el documento ya está guardado desde el primer equipo. Lo que
 * hace es el aviso que antes salía al crear la cotización — cuando el precio
 * quedó por debajo de la referencia y hay que esperar a gerencia.
 */
export async function finalizarCotizacion(
  cotizacionId: string,
): Promise<{ error: string | null; estadoAprobacion?: string }> {
  const supabase = await createClient();

  const { data: cotizacion } = await supabase
    .from("cotizaciones")
    .select("total, moneda, estado_aprobacion, oportunidad_id, oportunidades(cuentas(razon_social), perfiles(nombre))")
    .eq("id", cotizacionId)
    .maybeSingle();
  if (!cotizacion) return { error: "La cotización no existe" };

  if (cotizacion.estado_aprobacion === "pendiente_gerencia") {
    const oportunidad = cotizacion.oportunidades as unknown as {
      cuentas: { razon_social: string } | null;
      perfiles: { nombre: string } | null;
    } | null;
    await notificar({
      rol: "gerencia",
      tipo: "cotizacion_pendiente",
      // Todavía no tiene número: el correlativo se asigna al enviarla
      // (migración 0064), así que gerencia la reconoce por el cliente.
      titulo: `${oportunidad?.cuentas?.razon_social ?? "Una cotización"} requiere aprobación`,
      cuerpo: `De ${oportunidad?.perfiles?.nombre ?? "un comercial"} · ${cotizacion.moneda} ${cotizacion.total}`,
      url: "/gerencia/aprobaciones",
    });
  }

  revalidatePath(`/comercial/oportunidades/${cotizacion.oportunidad_id}`);
  revalidatePath("/comercial", "layout");
  return { error: null, estadoAprobacion: cotizacion.estado_aprobacion };
}

/**
 * Cambia la serie (EFAMEINSA ↔ OPEN) de un borrador ya empezado.
 *
 * La serie es lo único del documento que la base congela desde el insert —el
 * trigger de inmutabilidad la bloquea aunque siga en borrador (migración
 * 0066)—, porque de ella cuelga el correlativo. Así que no se «edita»: se
 * levanta un borrador nuevo con los mismos equipos y se borra el viejo. Sin
 * esto, elegir mal la serie obligaba a rearmar los seis equipos a mano.
 */
export async function cambiarSerieBorrador(datos: {
  cotizacionId: string;
  serie: "EFAMEINSA" | "OPEN";
}): Promise<{ error: string | null; cotizacionId?: string }> {
  const supabase = await createClient();

  const { data: original } = await supabase
    .from("cotizaciones")
    .select(
      "estado, enviada_at, oportunidad_id, condiciones, vigencia_dias, entrega_lugar, cotizacion_items(producto_id, descripcion, cantidad, precio_unitario, tier_aplicado, color)",
    )
    .eq("id", datos.cotizacionId)
    .maybeSingle();
  if (!original) return { error: "La cotización no existe" };
  if (original.estado !== "borrador" || original.enviada_at) {
    return { error: "Esta cotización ya salió al cliente: su serie no se cambia" };
  }

  const items =
    (original.cotizacion_items as {
      producto_id: string | null;
      descripcion: string | null;
      cantidad: number;
      precio_unitario: number;
      tier_aplicado: string | null;
      color: string | null;
    }[]) ?? [];
  if (items.length === 0) return { error: "El borrador no tiene equipos" };

  const { data, error } = await supabase.rpc("crear_cotizacion", {
    p_oportunidad_id: original.oportunidad_id,
    p_serie: datos.serie,
    p_items: items.map((i) => ({
      producto_id: i.producto_id,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      tier_aplicado: i.tier_aplicado ?? undefined,
      color: i.color,
    })),
    p_condiciones: original.condiciones,
    p_vigencia_dias: original.vigencia_dias,
  });
  if (error) return { error: limpiarError(error.message) };

  const nuevoId = data as string;
  await guardarEntrega(supabase, nuevoId, original.entrega_lugar);

  // Primero se crea y recién después se borra: si el borrado fallara, queda un
  // borrador de más —visible y borrable— en vez de perder el trabajo.
  const { error: errorBorrado } = await eliminarCotizacion(datos.cotizacionId);
  if (errorBorrado) {
    return {
      error: `Se creó el borrador en ${datos.serie}, pero el anterior quedó en la lista: bórrelo a mano.`,
      cotizacionId: nuevoId,
    };
  }

  revalidatePath(`/comercial/oportunidades/${original.oportunidad_id}`);
  return { error: null, cotizacionId: nuevoId };
}

export async function duplicarCotizacion(
  cotizacionId: string,
): Promise<{ error: string | null; codigoViejo?: string }> {
  const supabase = await createClient();

  const { data: original, error: errorOriginal } = await supabase
    .from("cotizaciones")
    .select("codigo, oportunidad_id, serie, condiciones, vigencia_dias, cotizacion_items(producto_id, descripcion, cantidad, precio_unitario, tier_aplicado, color)")
    .eq("id", cotizacionId)
    .maybeSingle();
  if (errorOriginal) return { error: errorOriginal.message };
  if (!original) return { error: "Cotización no encontrada" };

  const items =
    (original.cotizacion_items as {
      producto_id: string | null;
      descripcion: string | null;
      cantidad: number;
      precio_unitario: number;
      tier_aplicado: string | null;
      color: string | null;
    }[]) ?? [];
  if (items.length === 0) return { error: "La cotización original no tiene ítems" };

  const { error: errorRpc } = await supabase.rpc("crear_cotizacion", {
    p_oportunidad_id: original.oportunidad_id,
    p_serie: original.serie,
    p_items: items.map((i) => ({
      producto_id: i.producto_id,
      // Sin esto, una copia de una cotización con un equipo escrito a mano
      // perdía lo único que lo identificaba y la base la rechazaba.
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      tier_aplicado: i.tier_aplicado ?? undefined,
      // El color elegido es parte de lo que se le ofreció al cliente: sin él,
      // la copia saldría con otro color y otra foto en el PDF.
      color: i.color,
    })),
    p_condiciones: original.condiciones,
    p_vigencia_dias: original.vigencia_dias,
  });
  if (errorRpc) return { error: limpiarError(errorRpc.message) };

  revalidatePath(`/comercial/oportunidades/${original.oportunidad_id}`);
  // La copia nace como borrador sin número; lo recibe cuando se envía.
  return { error: null, codigoViejo: original.codigo ?? undefined };
}

/**
 * Envía la cotización al cliente — y recién ahí le asigna el número oficial.
 *
 * Pedido del ing. Carlos el 24-08: «¿en borrador genera número de cotización?
 * … Si es no, mejora. Porque en borrador, es más, a veces desiste». Un
 * borrador que se descarta dejaba un hueco en la serie (migración 0064).
 */
export async function enviarCotizacion(
  cotizacionId: string,
): Promise<{ error: string | null; codigo?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("emitir_cotizacion", { p_cotizacion_id: cotizacionId });
  if (error) return { error: limpiarError(error.message) };

  revalidatePath("/comercial", "layout");
  return { error: null, codigo: (data as string) ?? undefined };
}

export async function registrarVenta(cotizacionId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_venta", { p_cotizacion_id: cotizacionId });
  if (error) return { error: error.message };

  revalidatePath("/comercial", "layout");
  revalidatePath("/gerencia");
  return { error: null };
}

async function comercialDeCotizacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cotizacionId: string,
): Promise<{ comercialId: string | null; codigo: string | null }> {
  const { data } = await supabase
    .from("cotizaciones")
    .select("codigo, oportunidades(comercial_id)")
    .eq("id", cotizacionId)
    .maybeSingle();
  const oportunidad = data?.oportunidades as unknown as { comercial_id: string } | null;
  return { comercialId: oportunidad?.comercial_id ?? null, codigo: data?.codigo ?? null };
}

/**
 * Gerencia resuelve la cotización EQUIPO POR EQUIPO.
 *
 * Es como lo describió el ing. Carlos el 24-08: «me despliega en los 5 ítems.
 * El ítem 1 solamente quiere aprobar, porque los otros 4 le están mandando el
 * precio normal. El ítem 1, que estaba en 5 mil, quiere en 4 mil. Yo pongo OK».
 *
 * Solo entran a la decisión los equipos bajo precio de lista: pedir aprobación
 * de un equipo ES cotizarlo por debajo del piso, así que no hace falta que el
 * comercial marque nada aparte. Un solo equipo rechazado devuelve la cotización
 * entera — sale al cliente como una sola pieza.
 */
export async function resolverAprobacionCotizacion(datos: {
  cotizacionId: string;
  aprobados: string[];
  rechazados: string[];
  nota: string;
}): Promise<{ error: string | null }> {
  if (datos.rechazados.length > 0 && !datos.nota.trim()) {
    return { error: "Indique por qué se rechaza (le sirve al comercial para volver a cotizar)" };
  }

  const supabase = await createClient();
  const { comercialId } = await comercialDeCotizacion(supabase, datos.cotizacionId);

  const { data, error } = await supabase.rpc("resolver_aprobacion_cotizacion", {
    p_cotizacion_id: datos.cotizacionId,
    p_aprobados: datos.aprobados,
    p_rechazados: datos.rechazados,
    p_nota: datos.nota || null,
  });
  if (error) return { error: limpiarError(error.message) };

  const rechazada = data === "rechazada_gerencia";
  if (comercialId) {
    await notificar({
      userId: comercialId,
      tipo: rechazada ? "cotizacion_rechazada" : "cotizacion_aprobada",
      titulo: rechazada
        ? `Gerencia rechazó ${datos.rechazados.length} equipo(s) de su cotización`
        : "Gerencia aprobó los precios de su cotización",
      cuerpo: datos.nota || (rechazada ? "Corrija esos precios y vuelva a pedirla." : "Ya puede enviarla al cliente."),
      url: "/comercial/oportunidades",
    });
  }

  revalidatePath("/gerencia/aprobaciones");
  revalidatePath("/comercial", "layout");
  return { error: null };
}

/**
 * Borra una cotización que nunca salió al cliente.
 *
 * Pedido de Katerine (C5) el 24-08: probando el cotizador le quedaron varios
 * borradores del mismo cliente y no sabía cuál era el bueno.
 *
 * La regla de verdad está en la política de la migración 0065 — la base no
 * deja borrar una cotización enviada aunque alguien llame a esto directamente.
 * Acá se repite para poder dar un mensaje que se entienda en vez de un error
 * de permisos.
 */
export async function eliminarCotizacion(cotizacionId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: cot } = await supabase
    .from("cotizaciones")
    .select("codigo, estado, enviada_at, oportunidad_id")
    .eq("id", cotizacionId)
    .maybeSingle();
  if (!cot) return { error: "La cotización no existe" };
  if (cot.estado !== "borrador" || cot.enviada_at) {
    return { error: `${cot.codigo ?? "Esa cotización"} ya salió al cliente y no se borra` };
  }

  // `.select()` de vuelta: si RLS filtra la fila, el delete no da error,
  // simplemente no borra nada.
  const { data, error } = await supabase.from("cotizaciones").delete().eq("id", cotizacionId).select("id");
  if (error) return { error: limpiarError(error.message) };
  if (!data || data.length === 0) {
    return { error: "No se pudo borrar: solo el comercial dueño de la oportunidad puede hacerlo" };
  }

  revalidatePath(`/comercial/oportunidades/${cot.oportunidad_id}`);
  revalidatePath("/comercial", "layout");
  return { error: null };
}
