"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar, notificarCentral } from "@/lib/notificaciones";

/**
 * El Infocorp se pide por el CRM (0447). Brenda, buzón 12-10: «actualmente
 * enviamos correo a Central, se adjunta en el correo el RUC y el nombre de la
 * razón social». Central lo saca de Experian a mano (verificación en dos pasos
 * por correo) y sube el reporte; al comercial le llega a la campana.
 */
const limpiar = (e: string) => e.replace(/^[A-Z0-9]{5}:\s*/, "");

export async function pedirInfocorp(datos: {
  cuentaId: string | null;
  oportunidadId?: string | null;
  ruc?: string | null;
  razonSocial: string;
  nota?: string | null;
}): Promise<{ error: string | null; yaPedido?: boolean }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pedir_infocorp", {
    p_cuenta: datos.cuentaId,
    p_oportunidad: datos.oportunidadId ?? null,
    p_ruc: datos.ruc?.trim() || null,
    p_razon_social: datos.razonSocial.trim(),
    p_nota: datos.nota?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  const r = data as { id: string; ya_pedido: boolean };
  if (!r.ya_pedido) {
    const quien = perfil.codigo_comercial ? `${perfil.codigo_comercial} · ${perfil.nombre}` : perfil.nombre;
    await notificarCentral({
      tipo: "infocorp",
      titulo: `Infocorp · ${datos.razonSocial.trim()}${datos.ruc ? ` (RUC ${datos.ruc.trim()})` : ""}`,
      cuerpo: `${quien} pide el Infocorp.${datos.nota?.trim() ? ` ${datos.nota.trim()}` : ""}`,
      url: "/central/infocorp",
      esPrueba: perfil.es_prueba === true,
    });
  }
  revalidatePath("/central/infocorp");
  if (datos.oportunidadId) revalidatePath(`/comercial/oportunidades/${datos.oportunidadId}`);
  return { error: null, yaPedido: r.ya_pedido };
}

export async function responderInfocorp(datos: {
  id: string;
  resultado?: string | null;
  path?: string | null;
  nombre?: string | null;
}): Promise<{ error: string | null }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("responder_infocorp", {
    p_id: datos.id,
    p_resultado: datos.resultado?.trim() || null,
    p_archivo_path: datos.path ?? null,
    p_archivo_nombre: datos.nombre ?? null,
  });
  if (error) return { error: limpiar(error.message) };
  const r = data as { solicitado_por: string; razon_social: string; ruc: string | null; oportunidad_id: string | null; cuenta_id: string | null };
  await notificar({
    userId: r.solicitado_por,
    tipo: "infocorp",
    titulo: `Infocorp listo · ${r.razon_social}${r.ruc ? ` (RUC ${r.ruc})` : ""}`,
    cuerpo: datos.resultado?.trim() || (datos.path ? "Central subió el reporte." : undefined),
    url: r.oportunidad_id ? `/comercial/oportunidades/${r.oportunidad_id}#infocorp` : "/central/infocorp",
  });
  revalidatePath("/central/infocorp");
  if (r.oportunidad_id) revalidatePath(`/comercial/oportunidades/${r.oportunidad_id}`);
  return { error: null };
}
