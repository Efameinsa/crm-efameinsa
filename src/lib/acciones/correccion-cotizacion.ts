"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notificar } from "@/lib/notificaciones";
import type { ItemCotizacion } from "@/lib/acciones/cotizaciones";

/**
 * Corregir una cotización ya numerada, conservando el número.
 *
 * POR QUÉ EXISTE (ing. Carlos, 28-08): «no puedes variar el número, sobre todo
 * mucho ocurre con el banco, que es leasing… Un número más, se demora un mes
 * más en que salga la operación. Le tienes que dar exactamente el mismo
 * número.» Ocurre 5 a 10 veces al año sobre 3.000 cotizaciones.
 *
 * QUIÉN. Corrige el comercial dueño —es el único que sabe qué pidió el
 * cliente— con el código de cuatro dígitos que dictan operaciones o gerencia.
 * El reparto lo confirmó Lesly el 29-08. Diseño completo en
 * `docs/20-corregir-cotizacion-numerada.md`.
 *
 * EL CÓDIGO ABRE, NO GUARDA. Dura diez minutos y elegir el equipo correcto
 * toma más: validarlo abre una ventana de media hora sobre ESA cotización
 * (migración 0123). Guardar comprueba que siga viva.
 */

function limpiarError(mensaje: string): string {
  return mensaje.replace(/^[A-Z0-9]{5}:\s*/, "");
}

export interface FrenosCorreccion {
  puede: boolean;
  /** Qué lo impide, escrito para el comercial. */
  motivo?: string;
  codigo?: string | null;
  serie?: string;
  version?: number;
  total?: number;
  moneda?: string;
}

/**
 * Qué se lleva por delante corregir esta cotización — ANTES de pedir el código.
 * Nadie llama a operaciones para que le autoricen algo que no se va a poder
 * hacer.
 */
export async function frenosDeCorreccion(cotizacionId: string): Promise<FrenosCorreccion> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("frenos_correccion_cotizacion", { p_cotizacion: cotizacionId });
  if (error) return { puede: false, motivo: limpiarError(error.message) };
  return (data ?? { puede: false, motivo: "No se pudo comprobar" }) as FrenosCorreccion;
}

/**
 * El motivo y el código, en ese orden: el motivo es lo que el comercial le lee
 * al supervisor por teléfono para pedírselo.
 */
export async function abrirCorreccion(datos: {
  cotizacionId: string;
  motivo: string;
  pin: string;
}): Promise<{ error: string | null; expiraEn?: string; autorizo?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("abrir_correccion_cotizacion", {
    p_cotizacion: datos.cotizacionId,
    p_motivo: datos.motivo,
    p_pin: datos.pin,
  });
  if (error) return { error: limpiarError(error.message) };

  const abierta = data as { expira_at: string; autorizo: string };
  return { error: null, expiraEn: abierta.expira_at, autorizo: abierta.autorizo };
}

/**
 * Guarda la corrección: archiva la versión que el cliente tiene hoy y reescribe
 * el documento con el mismo número.
 *
 * Avisa a quien dictó el código. Dictar una autorización y no volver a saber
 * qué se hizo con ella no es autorizar, es adivinar — el mismo criterio que la
 * bitácora de operaciones (0114).
 */
export async function guardarCorreccion(datos: {
  cotizacionId: string;
  items: ItemCotizacion[];
  condiciones: string;
  vigenciaDias: number;
  entregaLugar: string | null;
  tiempoEntrega: string;
  garantia: string;
  formaPago: string;
  saldo: string;
}): Promise<{ error: string | null; codigo?: string | null; version?: number }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("corregir_cotizacion_emitida", {
    p_cotizacion: datos.cotizacionId,
    p_items: datos.items,
    p_condiciones: datos.condiciones || null,
    p_vigencia_dias: datos.vigenciaDias,
    p_entrega_lugar: datos.entregaLugar,
    p_tiempo_entrega: datos.tiempoEntrega,
    p_garantia: datos.garantia,
    p_forma_pago: datos.formaPago,
    p_saldo: datos.saldo,
  });
  if (error) return { error: limpiarError(error.message) };

  const r = data as { codigo: string | null; version: number; total: number; autorizo: string | null };

  const { data: quienAutorizo } = await supabase
    .from("correcciones_cotizacion")
    .select("autorizo, motivo")
    .eq("cotizacion_id", datos.cotizacionId)
    .not("guardada_at", "is", null)
    .order("guardada_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (quienAutorizo?.autorizo) {
    await notificar({
      userId: quienAutorizo.autorizo,
      tipo: "cotizacion_corregida",
      titulo: `Se corrigió la cotización ${r.codigo ?? ""} que usted autorizó`.trim(),
      cuerpo: quienAutorizo.motivo,
      url: "/operaciones",
    });
  }

  revalidatePath("/comercial", "layout");
  revalidatePath("/operaciones");
  return { error: null, codigo: r.codigo, version: r.version };
}
