"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notificar } from "@/lib/notificaciones";

export interface ItemCotizacion {
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  tier_aplicado?: string;
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
    .select("codigo, total, moneda, estado_aprobacion, oportunidades(comercial_id, perfiles(nombre))")
    .eq("id", cotizacionId)
    .maybeSingle();

  if (cotizacion?.estado_aprobacion === "pendiente_gerencia") {
    const oportunidad = cotizacion.oportunidades as unknown as { perfiles: { nombre: string } | null } | null;
    await notificar({
      rol: "gerencia",
      tipo: "cotizacion_pendiente",
      titulo: `${cotizacion.codigo} requiere aprobación`,
      cuerpo: `De ${oportunidad?.perfiles?.nombre ?? "un comercial"} · ${cotizacion.moneda} ${cotizacion.total}`,
      url: "/gerencia/aprobaciones",
    });
  }

  revalidatePath(`/comercial/oportunidades/${datos.oportunidadId}`);
  return { error: null, cotizacionId };
}

export async function enviarCotizacion(cotizacionId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cotizaciones")
    .update({ estado: "enviada", enviada_at: new Date().toISOString() })
    .eq("id", cotizacionId)
    .eq("estado", "borrador");
  if (error) return { error: error.message };

  revalidatePath("/comercial", "layout");
  return { error: null };
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

export async function aprobarCotizacion(
  cotizacionId: string,
  nota: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { comercialId, codigo } = await comercialDeCotizacion(supabase, cotizacionId);

  const { error } = await supabase
    .from("cotizaciones")
    .update({
      estado_aprobacion: "aprobada_gerencia",
      aprobada_por: user.id,
      aprobada_at: new Date().toISOString(),
      nota_gerencia: nota || null,
    })
    .eq("id", cotizacionId)
    .eq("estado_aprobacion", "pendiente_gerencia");
  if (error) return { error: error.message };

  if (comercialId) {
    await notificar({
      userId: comercialId,
      tipo: "cotizacion_aprobada",
      titulo: `${codigo} aprobada`,
      cuerpo: nota || "Ya puede enviarla al cliente.",
      url: "/comercial/oportunidades",
    });
  }

  revalidatePath("/gerencia/aprobaciones");
  return { error: null };
}

export async function rechazarCotizacion(
  cotizacionId: string,
  nota: string,
): Promise<{ error: string | null }> {
  if (!nota.trim()) return { error: "Indique por qué se rechaza (le sirve al comercial para volver a cotizar)" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  const { comercialId, codigo } = await comercialDeCotizacion(supabase, cotizacionId);

  const { error } = await supabase
    .from("cotizaciones")
    .update({
      estado_aprobacion: "rechazada_gerencia",
      aprobada_por: user.id,
      aprobada_at: new Date().toISOString(),
      nota_gerencia: nota,
    })
    .eq("id", cotizacionId)
    .eq("estado_aprobacion", "pendiente_gerencia");
  if (error) return { error: error.message };

  if (comercialId) {
    await notificar({
      userId: comercialId,
      tipo: "cotizacion_rechazada",
      titulo: `${codigo} rechazada`,
      cuerpo: nota,
      url: "/comercial/oportunidades",
    });
  }

  revalidatePath("/gerencia/aprobaciones");
  return { error: null };
}
