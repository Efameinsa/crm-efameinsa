"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Corregir un informe de servicio ya emitido (0383, Santos 02-10): con el
 * código de operaciones o gerencia, con motivo, y queda guardado lo que había
 * antes. La función de la base decide quién puede (postventa, gerencia,
 * operaciones o el almacén que lo elaboró) y qué campos se tocan.
 */
export type CambiosInforme = Partial<{
  asunto: string | null;
  tecnico: string | null;
  ejecutado_at: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  equipo_texto: string | null;
  detalle: string | null;
  verificacion: string | null;
  observaciones: string | null;
  accesorios: string | null;
  pendientes: string | null;
  secciones: { titulo: string; texto: string }[];
  cliente_conforme_nombre: string | null;
  cliente_conforme_doc: string | null;
}>;

export async function corregirInformeServicio(
  informeId: string,
  cambios: CambiosInforme,
  motivo: string,
  pin: string,
): Promise<{ error: string | null; version?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("corregir_informe_servicio", {
    p_informe: informeId,
    p_cambios: cambios,
    p_motivo: motivo,
    p_pin: pin,
  });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  revalidatePath(`/postventa/informes/${informeId}`);
  revalidatePath(`/postventa/informes/${informeId}/imprimir`);
  return { error: null, version: (data as { version?: number } | null)?.version };
}
