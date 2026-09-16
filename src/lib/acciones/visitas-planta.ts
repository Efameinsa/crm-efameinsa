"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";

/**
 * Quién viene a la planta (0238).
 *
 * Carlos, 15-09, con Lavipronto (el cliente viene el sábado a ver su máquina y
 * pagar el saldo): «registramos la visita. Eso llega a la central: RUC, si es
 * empresa, nombre de la empresa, la persona con DNI y el motivo. Y la central
 * ya hace su trabajo de imprimirlo y llevarlo al vigilante». Comerciales y
 * postventa registran; Central imprime.
 */
const limpiar = (e: string) => e.replace(/^[A-Z0-9]{5}:\s*/, "");

export async function registrarVisitaPlanta(datos: {
  cuentaId: string | null;
  oportunidadId?: string | null;
  empresa: string;
  ruc?: string | null;
  persona: string;
  dni?: string | null;
  telefono?: string | null;
  motivo: string;
  fecha: string;
  hora?: string | null;
}): Promise<{ error: string | null; id?: string }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_visita_planta", {
    p_cuenta: datos.cuentaId,
    p_empresa: datos.empresa.trim(),
    p_ruc: datos.ruc?.trim() || null,
    p_persona: datos.persona.trim(),
    p_dni: datos.dni?.trim() || null,
    p_telefono: datos.telefono?.trim() || null,
    p_motivo: datos.motivo.trim(),
    p_fecha: datos.fecha,
    p_hora: datos.hora || null,
    p_oportunidad: datos.oportunidadId ?? null,
  });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/central/visitas");
  revalidatePath("/postventa/agenda");
  return { error: null, id: data as string };
}

export async function marcarVisitaImpresa(visitaId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_visita_impresa", { p_visita: visitaId });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/central/visitas");
  return { error: null };
}

export async function cancelarVisitaPlanta(visitaId: string, motivo: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_visita_planta", { p_visita: visitaId, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/central/visitas");
  revalidatePath("/postventa/agenda");
  return { error: null };
}
