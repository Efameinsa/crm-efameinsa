"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar, notificarAlmacen } from "@/lib/notificaciones";

// ORDEN DE RECEPCIÓN Y REVISIÓN DE EQUIPO (0557, reunión de gerencia 20-10,
// pedido de Brenda PV2): el equipo que llega a planta por garantía,
// reparación o revisión. Postventa da la orden desde el caso; el almacén
// registra que llegó (con fotos), la revisión (técnico y diagnóstico) y qué
// sigue. Cada paso avisa a postventa.

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");

export type MotivoRecepcion = "garantia" | "reparacion" | "revision" | "otro";
export type LlegaPor = "cliente" | "agencia" | "tecnico" | "otro";
export type FotoRecepcion = { path: string; nombre: string; tipo: string };

function revalidar(id: string, atencionId?: string | null) {
  revalidatePath(`/recepciones/${id}`);
  revalidatePath("/recepciones");
  revalidatePath("/almacen");
  if (atencionId) revalidatePath(`/postventa/atenciones/${atencionId}`);
}

export async function crearRecepcion(datos: {
  atencionId: string;
  equipo: string;
  serie: string | null;
  motivo: MotivoRecepcion;
  llegaPor: LlegaPor;
  fecha: string | null;
  nota: string | null;
}): Promise<{ error: string | null; id?: string }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crear_recepcion_equipo", {
    p_atencion: datos.atencionId,
    p_equipo: datos.equipo,
    p_serie: datos.serie,
    p_motivo: datos.motivo,
    p_llega_por: datos.llegaPor,
    p_fecha: datos.fecha || null,
    p_nota: datos.nota,
  });
  if (error) return { error: limpiar(error.message) };
  const id = data as string;
  const { data: r } = await supabase.from("recepciones_equipo").select("codigo, cuentas(razon_social)").eq("id", id).maybeSingle();
  await notificarAlmacen({
    titulo: `Llega un equipo a revisar · ${(r?.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? ""}`,
    cuerpo: `${r?.codigo ?? "Orden de recepción"}: ${datos.equipo}${datos.serie ? ` (serie ${datos.serie})` : ""}${datos.fecha ? `, llega el ${datos.fecha.split("-").reverse().join("-")}` : ""}. Lo pidió ${perfil.nombre}.`,
    url: `/recepciones/${id}`,
    esPrueba: perfil.es_prueba === true,
  });
  revalidar(id, datos.atencionId);
  return { error: null, id };
}

export async function pasoRecepcion(datos: {
  id: string;
  paso: "recibido" | "revisado" | "listo" | "anular";
  nota?: string | null;
  fotos?: FotoRecepcion[];
  tecnico?: string | null;
  diagnostico?: string | null;
  repuestos?: string | null;
  resultado?: "devolver" | "cotizar" | "otro" | null;
}): Promise<{ error: string | null }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("almacen_recepcion_paso", {
    p_id: datos.id,
    p_paso: datos.paso,
    p_nota: datos.nota ?? null,
    p_fotos: datos.fotos ?? [],
    p_tecnico: datos.tecnico ?? null,
    p_diagnostico: datos.diagnostico ?? null,
    p_repuestos: datos.repuestos ?? null,
    p_resultado: datos.resultado ?? null,
  });
  if (error) return { error: limpiar(error.message) };
  const { data: r } = await supabase
    .from("recepciones_equipo")
    .select("codigo, atencion_id, creada_por, equipo_texto, cuentas(razon_social), atenciones(asignado_a, tomada_por)")
    .eq("id", datos.id)
    .maybeSingle();
  if (r && datos.paso !== "anular") {
    const at = r.atenciones as unknown as { asignado_a: string | null; tomada_por: string | null } | null;
    const destinos = [...new Set([r.creada_por as string | null, at?.tomada_por ?? null, at?.asignado_a ?? null].filter(Boolean) as string[])].filter(
      (x) => x !== perfil.id,
    );
    const que =
      datos.paso === "recibido"
        ? "El equipo llegó a planta"
        : datos.paso === "revisado"
          ? `Revisado: ${datos.diagnostico ?? ""}`.slice(0, 160)
          : datos.resultado === "cotizar"
            ? "Listo: hay que cotizarle al cliente"
            : "Listo para devolver al cliente";
    await Promise.all(
      destinos.map((userId) =>
        notificar({
          userId,
          tipo: "almacen",
          titulo: `${r.codigo} · ${(r.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? ""}`,
          cuerpo: `${que} (${r.equipo_texto}). Lo registró ${perfil.nombre}.`,
          url: `/recepciones/${datos.id}`,
        }),
      ),
    );
  }
  revalidar(datos.id, (r?.atencion_id as string | null) ?? null);
  return { error: null };
}
