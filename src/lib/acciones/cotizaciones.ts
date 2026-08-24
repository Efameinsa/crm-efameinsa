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
}

/**
 * Los `raise exception` de plpgsql están escritos para que el comercial los
 * entienda; llegan tal cual salvo que el driver les anteponga el SQLSTATE.
 * Solo se quita ese prefijo — el mensaje puede tener dos puntos adentro.
 */
function limpiarError(mensaje: string): string {
  return mensaje.replace(/^[A-Z0-9]{5}:\s*/, "");
}

export async function crearCotizacion(datos: {
  oportunidadId: string;
  serie: "EFAMEINSA" | "OPEN";
  items: ItemCotizacion[];
  condiciones: string;
  vigenciaDias: number;
}): Promise<{ error: string | null; cotizacionId?: string }> {
  if (datos.items.length === 0) return { error: "Agregue al menos un producto" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crear_cotizacion", {
    p_oportunidad_id: datos.oportunidadId,
    p_serie: datos.serie,
    p_items: datos.items,
    p_condiciones: datos.condiciones || null,
    p_vigencia_dias: datos.vigenciaDias,
  });
  if (error) return { error: error.message };

  const cotizacionId = data as string;

  const { data: cotizacion } = await supabase
    .from("cotizaciones")
    .select("codigo, total, moneda, estado_aprobacion, oportunidades(comercial_id, cuentas(razon_social), perfiles(nombre))")
    .eq("id", cotizacionId)
    .maybeSingle();

  if (cotizacion?.estado_aprobacion === "pendiente_gerencia") {
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

  revalidatePath(`/comercial/oportunidades/${datos.oportunidadId}`);
  return { error: null, cotizacionId };
}

export async function duplicarCotizacion(
  cotizacionId: string,
): Promise<{ error: string | null; codigoViejo?: string }> {
  const supabase = await createClient();

  const { data: original, error: errorOriginal } = await supabase
    .from("cotizaciones")
    .select("codigo, oportunidad_id, serie, condiciones, vigencia_dias, cotizacion_items(producto_id, descripcion, cantidad, precio_unitario, tier_aplicado)")
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
 * Corrige una cotización que todavía no se envió.
 *
 * Pedido de Brenda el 24-08, primer día de uso real: hasta entonces un error de
 * tipeo obligaba a duplicar la cotización y quemar un número. La regla de
 * gerencia —una cotización no cambia de precio bajo el mismo número— sigue
 * intacta: la función de la base rechaza cualquier edición en cuanto el
 * documento se envía (migración 0062).
 */
export async function editarCotizacion(datos: {
  cotizacionId: string;
  items: ItemCotizacion[];
  condiciones: string;
  vigenciaDias: number;
}): Promise<{ error: string | null }> {
  if (datos.items.length === 0) return { error: "La cotización necesita al menos un equipo" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("editar_cotizacion", {
    p_cotizacion_id: datos.cotizacionId,
    p_items: datos.items,
    p_condiciones: datos.condiciones || null,
    p_vigencia_dias: datos.vigenciaDias,
  });
  if (error) return { error: limpiarError(error.message) };

  const { data: cot } = await supabase
    .from("cotizaciones")
    .select("oportunidad_id")
    .eq("id", datos.cotizacionId)
    .maybeSingle();
  if (cot) revalidatePath(`/comercial/oportunidades/${cot.oportunidad_id}`);
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
