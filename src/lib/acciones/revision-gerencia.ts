"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notificar } from "@/lib/notificaciones";

/**
 * POSTVENTA LE PIDE AL INGENIERO QUE REVISE UN BORRADOR, Y SABE CUÁNDO LO VIO
 * (0392; Gabriela, 05-10: «lo que quiero es saber cómo sé que el ingeniero lo
 * vio… así como sale para derivar llamada a almacén»).
 *
 * Los borradores de postventa no piden aprobación —van a precio de
 * catálogo—, así que hasta hoy gerencia no se enteraba de ellos y postventa
 * no tenía cómo saber si alguien los había mirado. Esto no aprueba nada: es
 * el pedido y su acuse.
 */
export async function pedirRevisionGerencia(cotizacionId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("pedir_revision_cotizacion", { p_cotizacion: cotizacionId });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };

  const { data: c } = await supabase
    .from("cotizaciones")
    .select("total, moneda, oportunidad_id, autor:perfiles!cotizaciones_creada_por_fkey(nombre), oportunidades!cotizaciones_oportunidad_id_fkey(cuentas(razon_social))")
    .eq("id", cotizacionId)
    .maybeSingle();
  const cliente = (c?.oportunidades as unknown as { cuentas: { razon_social: string } | null } | null)?.cuentas?.razon_social;
  const autor = (c?.autor as unknown as { nombre: string } | null)?.nombre;
  await notificar({
    rol: "gerencia",
    tipo: "cotizacion_revision",
    titulo: `Postventa pide revisar: ${cliente ?? "una cotización"}`,
    cuerpo: `De ${autor ?? "postventa"}${c ? ` · ${c.moneda} ${Number(c.total).toLocaleString("es-PE")}` : ""} · borrador`,
    url: "/gerencia/aprobaciones",
  });
  revalidatePath("/comercial/cotizaciones");
  if (c?.oportunidad_id) revalidatePath(`/comercial/oportunidades/${c.oportunidad_id}`);
  return { error: null };
}

/**
 * Gerencia abrió el borrador. La primera vez (o la primera después de un nuevo
 * pedido) se anota quién y cuándo, y se le avisa a quien la pidió —o a quien
 * la hizo—. Las siguientes no hacen ruido.
 */
export async function marcarVistaGerencia(cotizacionId: string): Promise<void> {
  const supabase = await createClient();
  const { data: primera } = await supabase.rpc("marcar_cotizacion_vista_gerencia", { p_cotizacion: cotizacionId });
  if (!primera) return;
  const { data: c } = await supabase
    .from("cotizaciones")
    .select("creada_por, revision_pedida_por, oportunidad_id, vista:perfiles!cotizaciones_vista_gerencia_por_fkey(nombre), oportunidades!cotizaciones_oportunidad_id_fkey(cuentas(razon_social))")
    .eq("id", cotizacionId)
    .maybeSingle();
  if (!c) return;
  const destino = (c.revision_pedida_por as string | null) ?? (c.creada_por as string | null);
  if (!destino) return;
  const quien = (c.vista as unknown as { nombre: string } | null)?.nombre ?? "Gerencia";
  const cliente = (c.oportunidades as unknown as { cuentas: { razon_social: string } | null } | null)?.cuentas?.razon_social;
  await notificar({
    userId: destino,
    tipo: "cotizacion_vista",
    titulo: `${quien} vio su cotización${cliente ? ` de ${cliente}` : ""}`,
    url: `/comercial/oportunidades/${c.oportunidad_id}/cotizar/${cotizacionId}`,
  });
  revalidatePath("/comercial/cotizaciones");
}
