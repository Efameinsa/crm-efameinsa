"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notificar } from "@/lib/notificaciones";

/**
 * Anular una cotización que ya salió con número (migración 0433).
 *
 * POR QUÉ (10-10, Rubí con la Presu_1118-26): una cotización con fallas no se
 * borra —el número ya se gastó y gerencia decidió el 03-09 que los números no
 * se rellenan ni desaparecen—, y tampoco basta con ignorarla: seguiría viva en
 * los reportes. Se ANULA: queda a la vista, en rojo, con el motivo.
 *
 * Mismo trámite que corregir: motivo primero (lo que se le lee a quien
 * autoriza) y código de operaciones o gerencia.
 */

function limpiarError(mensaje: string): string {
  return mensaje.replace(/^[A-Z0-9]{5}:\s*/, "");
}

export interface FrenosAnulacion {
  puede: boolean;
  motivo?: string;
  codigo?: string | null;
  total?: number;
  moneda?: string;
}

export async function frenosDeAnulacion(cotizacionId: string): Promise<FrenosAnulacion> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("frenos_anular_cotizacion", { p_cotizacion: cotizacionId });
  if (error) return { puede: false, motivo: limpiarError(error.message) };
  return (data ?? { puede: false, motivo: "No se pudo comprobar" }) as FrenosAnulacion;
}

export async function anularCotizacion(datos: {
  cotizacionId: string;
  motivo: string;
  pin: string;
}): Promise<{ error: string | null; codigo?: string | null; autorizo?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("anular_cotizacion", {
    p_cotizacion: datos.cotizacionId,
    p_motivo: datos.motivo,
    p_pin: datos.pin,
  });
  if (error) return { error: limpiarError(error.message) };

  const r = data as { codigo: string | null; autorizo: string; autorizo_id: string };

  // Quien dictó el código se entera de qué se hizo con él (criterio de 0114).
  await notificar({
    userId: r.autorizo_id,
    tipo: "cotizacion_anulada",
    titulo: `Se anuló la cotización ${r.codigo ?? ""} que usted autorizó`.trim(),
    cuerpo: datos.motivo.trim(),
    url: "/central/presupuestos",
  });

  revalidatePath("/comercial", "layout");
  revalidatePath("/central/presupuestos");
  revalidatePath("/operaciones");
  return { error: null, codigo: r.codigo, autorizo: r.autorizo };
}
