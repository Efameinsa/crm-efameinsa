"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notificar } from "@/lib/notificaciones";

/**
 * El comercial avisa que su cliente no quiere equipos: quiere servicio.
 *
 * EL CASO, del 29-08. Brenda llamó al PRO-09015 y anotó: «no desea equipos, no
 * tiene presupuesto ni para semi industrial, desea mmto, repuestos, se le
 * indicó que se va a derivar con postventa». Central quiso mandarlo a Post
 * Venta y se encontró con que redirigir no la dejaba —el cliente ya tenía
 * gestiones, otras oportunidades y una compra de 2023—, así que la única
 * salida era volver a tipear el contacto a mano.
 *
 * LO QUE FALTABA ERA EL CAMINO entre quien SE ENTERA y quien PUEDE. Se entera
 * el comercial, al teléfono. Deriva Central, que es la regla desde el 24-08.
 * Entre los dos no había nada: la decisión quedaba escrita en una nota de
 * gestión que Central no lee.
 *
 * NO ES REDIRIGIR, y la diferencia importa: redirigir le sacaría la oportunidad
 * al comercial —con su trabajo y el registro de que ese cliente NO compra
 * equipos— y le entregaría el cliente a postventa. La regla de la casa es la
 * contraria (migración 0080): «postventa es un ÁREA que atiende casos, no una
 * cartera». Así que esto crea un contacto NUEVO para el mismo cliente, con la
 * sugerencia ya puesta, y Central lo deriva con un clic.
 */

function limpiarError(mensaje: string): string {
  return mensaje.replace(/^[A-Z0-9]{5}:\s*/, "");
}

export type TipoServicio = "garantia" | "repuesto" | "mantenimiento";

export async function avisarClientePideServicio(datos: {
  oportunidadId: string;
  tipo: TipoServicio;
  nota: string;
}): Promise<{ error: string | null; codigo?: string; repetido?: boolean }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("avisar_cliente_pide_servicio", {
    p_oportunidad: datos.oportunidadId,
    p_tipo: datos.tipo,
    p_nota: datos.nota,
  });
  if (error) return { error: limpiarError(error.message) };

  const r = data as { codigo: string; repetido: boolean };

  // Central tiene que enterarse hoy, no cuando le toque revisar la bandeja: el
  // cliente está esperando una respuesta que el comercial ya le prometió.
  if (!r.repetido) {
    await notificar({
      rol: "central",
      tipo: "lead_registrado",
      titulo: `${r.codigo} · un cliente pide servicio, no equipos`,
      cuerpo: datos.nota,
      url: "/central",
    });
  }

  revalidatePath(`/comercial/oportunidades/${datos.oportunidadId}`);
  revalidatePath("/central");
  return { error: null, codigo: r.codigo, repetido: r.repetido };
}
