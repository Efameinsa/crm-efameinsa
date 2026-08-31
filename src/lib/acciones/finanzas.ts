"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { CONTACTO_FINANZAS, NUMERO_WHATSAPP_FINANZAS } from "@/lib/tesoreria";

/**
 * Derivar a Finanzas lo que llega a Central y no es una venta.
 *
 * Pedido del ing. Carlos el 31-08, sobre un caso real: un comercial registró
 * que el cliente pedía su factura. «Eso no suma como netamente el tema
 * comercial (…) ¿rechaza?, ¿hacia dónde va?». La salida que definió: Central lo
 * asigna a Finanzas, le llega el mensaje al WhatsApp de Tesorería, y queda
 * derivado — ni descartado, ni contando como gestión de nadie.
 */


export async function derivarAFinanzas(datos: {
  leadId: string;
  detalle: string;
}): Promise<{ error: string | null; enlace?: string }> {
  const detalle = datos.detalle.trim();
  if (detalle.length < 10) {
    return { error: "Escriba qué pidió el cliente: es lo único que va a leer Tesorería" };
  }

  const perfil = await requerirPerfil();
  // Deriva Central, y también gerencia por si hay que corregir algo. Un
  // comercial no: la regla de que Central es quien reparte es de Carlos, del
  // 24-08, y se volvió a confirmar con Lesly el 31-08.
  if (!["central", "gerencia", "admin"].includes(perfil.rol) && !perfil.es_operaciones) {
    return { error: "Solo Central puede derivar un contacto a otra área" };
  }

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, codigo, nombre_contacto, razon_social, num_doc, telefono, estado")
    .eq("id", datos.leadId)
    .maybeSingle();
  if (!lead) return { error: "Ese contacto ya no está" };

  const { error } = await supabase
    .from("leads")
    .update({
      estado: "derivado_area",
      area_destino: "finanzas",
      asignado_por: perfil.id,
      asignado_at: new Date().toISOString(),
    })
    .eq("id", datos.leadId);
  if (error) return { error: error.message };

  revalidatePath("/central");
  revalidatePath("/central/informe");

  const cliente = lead.razon_social ?? lead.nombre_contacto ?? "Un cliente";
  const doc = lead.num_doc ? ` (${lead.num_doc})` : "";
  const codigo = lead.codigo ? ` · ${lead.codigo}` : "";
  const texto =
    `Hola ${CONTACTO_FINANZAS}, buen día. Te derivamos un pedido que llegó a Central y es de Tesorería:\n\n` +
    `Cliente: ${cliente}${doc}\n` +
    (lead.telefono ? `Teléfono del cliente: ${lead.telefono}\n` : "") +
    `Pedido: ${detalle}\n` +
    `\nRegistrado por ${perfil.nombre}${codigo}. Gracias.`;

  return { error: null, enlace: `https://wa.me/${NUMERO_WHATSAPP_FINANZAS}?text=${encodeURIComponent(texto)}` };
}
