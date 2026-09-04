"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { CONTACTO_FINANZAS, NUMERO_WHATSAPP_FINANZAS } from "@/lib/tesoreria";

/**
 * Un mismo aviso, a las tres áreas que lo necesitan.
 *
 * El ing. Carlos, 04-09 (10:48), con Central delante: «yo hice un cierre,
 * entregué todo, pero pagó solamente el 50%, y mañana me va a cancelar. Llega
 * el día siguiente, ya me canceló, y yo tengo que avisar. Eso del ERP no es
 * necesario, hacerlo simplemente en el CRM. Y esa información va a ir, uno a
 * Finanzas, que ya está; dos al mismo comercial, para que le cargue en su
 * historial; y tres a postventa».
 *
 * Antes solo existía la salida a Finanzas (0133). El resto del recorrido lo
 * hace la función `derivar_aviso` de la 0168, que anota el aviso en el
 * historial del cliente y en su pedido de postventa. Acá arriba queda lo único
 * que la base no puede hacer: escribir el WhatsApp de Tesorería.
 */
export interface ResultadoAviso {
  error: string | null;
  /** Lo que sí quedó registrado, en palabras, para decírselo a Central. */
  hecho?: string[];
  /** Lo que no se pudo hacer y por qué: no es un error, es información. */
  falta?: string[];
  /** Solo si el aviso iba a Finanzas: el mensaje ya escrito. */
  enlace?: string;
}

export async function derivarAviso(datos: {
  leadId: string;
  finanzas: boolean;
  postventa: boolean;
  comercial: boolean;
  detalle: string;
}): Promise<ResultadoAviso> {
  const detalle = datos.detalle.trim();
  if (detalle.length < 10) {
    return { error: "Escriba qué avisó el cliente: es lo único que van a leer las áreas" };
  }
  if (!datos.finanzas && !datos.postventa && !datos.comercial) {
    return { error: "Elija al menos un destino" };
  }

  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("derivar_aviso", {
    p_lead: datos.leadId,
    p_finanzas: datos.finanzas,
    p_postventa: datos.postventa,
    p_comercial: datos.comercial,
    p_detalle: detalle,
  });
  if (error) return { error: error.message };

  const r = data as {
    hecho: string[];
    falta: string[];
    cliente: string | null;
    documento: string | null;
    telefono: string | null;
    codigo: string | null;
  };

  revalidatePath("/central");
  revalidatePath("/central/derivados");
  revalidatePath("/central/informe");

  if (!datos.finanzas) return { error: null, hecho: r.hecho, falta: r.falta };

  // El WhatsApp se abre, no se manda solo: mandarlo sin intervención exige la
  // API oficial de Meta, que cobra por conversación (la razón está entera en la
  // 0133). El CRM deja el mensaje escrito y Central presiona enviar.
  const cliente = r.cliente ?? "Un cliente";
  const doc = r.documento ? ` (${r.documento})` : "";
  const codigo = r.codigo ? ` · ${r.codigo}` : "";
  const texto =
    `Hola ${CONTACTO_FINANZAS}, buen día. Te derivamos un pedido que llegó a Central y es de Tesorería:\n\n` +
    `Cliente: ${cliente}${doc}\n` +
    (r.telefono ? `Teléfono del cliente: ${r.telefono}\n` : "") +
    `Pedido: ${detalle}\n` +
    `\nRegistrado por ${perfil.nombre}${codigo}. Gracias.`;

  return {
    error: null,
    hecho: r.hecho,
    falta: r.falta,
    enlace: `https://wa.me/${NUMERO_WHATSAPP_FINANZAS}?text=${encodeURIComponent(texto)}`,
  };
}

/**
 * Devolver a la bandeja un contacto que se había rechazado.
 *
 * Carlos, 04-09: «está bien que se rechace, pero que se vea con los rechazados,
 * porque cualquier eventualidad la podemos retomar (…) ahora sí,
 * redirecciónalo a Finanzas, o al comercial que lo está atendiendo. Que te
 * permita verlo y retomarlo».
 */
export async function retomarLead(leadId: string): Promise<{ error: string | null; codigo?: string }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("retomar_lead", { p_lead: leadId });
  if (error) return { error: error.message };
  revalidatePath("/central");
  revalidatePath("/central/derivados");
  return { error: null, codigo: (data as { codigo: string | null })?.codigo ?? undefined };
}
