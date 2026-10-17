"use server";

import { revalidatePath } from "next/cache";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";

/**
 * «Ofrecer mantenimiento»: abre la oportunidad de servicio para un cliente
 * del parque, a nombre de quien la abre —comercial o postventa, ambos venden
 * (Santos, 02-09)—, y la deja para hoy en Mi día.
 *
 * Si ya hay una abierta, de quien sea, no se duplica: se devuelve a esa, con
 * quién la tiene. Esa es la regla de «uno ve la gestión del otro».
 */
export async function ofrecerMantenimiento(
  cuentaId: string,
): Promise<{ error: string | null; oportunidadId?: string; yaEstaba?: boolean; quien?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(cuentaId)) return { error: "Cliente inválido" };
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const { data: abierta } = await supabase
    .from("oportunidades")
    .select("id, comercial_id, perfiles!oportunidades_comercial_id_fkey(nombre, codigo_comercial)")
    .eq("cuenta_id", cuentaId)
    // 0530: un cliente, una carpeta de postventa. Si ya tiene una abierta, del
    // tipo que sea, el mantenimiento se ofrece desde ahí.
    .not("tipo_postventa", "is", null)
    .not("etapa", "in", "(venta,rechazada,derivada,historico)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (abierta) {
    const p = abierta.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
    const quien = abierta.comercial_id === perfil.id ? "usted" : p ? `${p.nombre}${p.codigo_comercial ? ` (${p.codigo_comercial})` : ""}` : "otra persona";
    // Queda para hoy en la carpeta, sin pisar una acción más cercana.
    await supabase
      .from("oportunidades")
      .update({ proxima_accion: "Ofrecer mantenimiento preventivo", proxima_accion_at: hoyLima(), proxima_accion_hora: null })
      .eq("id", abierta.id)
      .or(`proxima_accion_at.is.null,proxima_accion_at.lt.${hoyLima()}`);
    return { error: null, oportunidadId: abierta.id as string, yaEstaba: true, quien };
  }

  const { data: cuenta } = await supabase
    .from("cuentas")
    .select("id, razon_social, no_contactar_at")
    .eq("id", cuentaId)
    .maybeSingle();
  if (!cuenta) return { error: "No se encontró el cliente" };
  // Última barrera (0217). La pantalla ya no muestra el botón, pero abrirle una
  // oportunidad de mantenimiento a quien pidió que no lo llamen es justo lo que
  // no debe poder pasar por ningún camino.
  if (cuenta.no_contactar_at) {
    return { error: "Este cliente pidió que no lo contacten. Si volvió a escribir, quite esa marca en su ficha antes de abrirle una gestión." };
  }

  const hoy = hoyLima();
  const { data: nueva, error } = await supabase
    .from("oportunidades")
    .insert({
      cuenta_id: cuentaId,
      comercial_id: perfil.id,
      etapa: "seguimiento",
      intencion: "medio",
      moneda: "USD",
      origen: "crm",
      tipo_postventa: "mantenimiento",
      proxima_accion: "Ofrecer mantenimiento preventivo",
      proxima_accion_at: hoy,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/comercial", "layout");
  revalidatePath("/postventa", "layout");
  return { error: null, oportunidadId: nueva.id as string, yaEstaba: false };
}
