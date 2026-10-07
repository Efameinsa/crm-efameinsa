"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notificar } from "@/lib/notificaciones";

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
  /** El cuadro «para cotizar» (buzón del almacén, 06-10): se corrige como lo demás. */
  repuestos: { codigo: string; descripcion: string; cantidad: number | null; unidad: string; precio: number | null; igv: "incluye" | "no_incluye"; stock: string | null }[];
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
  // El cuadro, con los mismos topes que al emitir el informe.
  if (cambios.repuestos) {
    cambios = {
      ...cambios,
      repuestos: cambios.repuestos
        .filter((r) => r.descripcion?.trim())
        .slice(0, 40)
        .map((r) => ({
          codigo: String(r.codigo ?? "").trim().slice(0, 40),
          descripcion: String(r.descripcion).trim().slice(0, 200),
          cantidad: r.cantidad == null || Number.isNaN(Number(r.cantidad)) ? null : Number(r.cantidad),
          unidad: r.unidad ? String(r.unidad).trim().slice(0, 12) : "und",
          precio: r.precio == null || Number.isNaN(Number(r.precio)) ? null : Number(r.precio),
          igv: r.igv === "incluye" ? "incluye" : "no_incluye",
          stock: r.stock ? String(r.stock).trim().slice(0, 40) : null,
        })),
    };
  }
  const { data, error } = await supabase.rpc("corregir_informe_servicio", {
    p_informe: informeId,
    p_cambios: cambios,
    p_motivo: motivo,
    p_pin: pin,
  });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  revalidatePath(`/postventa/informes/${informeId}`);
  revalidatePath(`/postventa/informes/${informeId}/imprimir`);
  // Si ahora hay algo para cotizar, quien derivó la llamada se entera, como
  // cuando el almacén sube el informe por primera vez.
  if (cambios.repuestos?.length) {
    const { data: inf } = await supabase.from("informes_servicio").select("apertura_id").eq("id", informeId).maybeSingle();
    if (inf?.apertura_id) {
      const { data: a } = await supabase
        .from("aperturas_llamada")
        .select("solicitada_por, cuentas(razon_social)")
        .eq("id", inf.apertura_id)
        .maybeSingle();
      if (a?.solicitada_por) {
        const razon = ((a.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "").replace(/^\d{8,11}\s*-\s*/, "");
        await notificar({
          userId: a.solicitada_por,
          tipo: "almacen",
          titulo: `Informe corregido · ${razon || "cliente"}`,
          cuerpo: `El almacén corrigió el informe y agregó cosas para cotizar (${cambios.repuestos.length}). Revíselo antes de mandarlo al cliente.`,
          url: `/aperturas/${inf.apertura_id}`,
        });
      }
      revalidatePath(`/aperturas/${inf.apertura_id}`);
    }
  }
  return { error: null, version: (data as { version?: number } | null)?.version };
}
