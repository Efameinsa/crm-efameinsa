"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { errorDocumento, type TipoDocumento } from "@/lib/documento";

// El resumen narrativo vive en cuentas.notas (existe desde B1, sin UI hasta
// ahora). La RLS ya resuelve quién puede editar: cuentas_comercial (FOR ALL,
// comercial_id = auth.uid()) permite solo al dueño ACTUAL de la cartera;
// cuentas_backoffice a gerencia/admin. Un comercial que perdió la cartera
// puede LEER el resumen (la ficha se lo muestra) pero no editarlo.
export async function actualizarResumenCuenta(
  cuentaId: string,
  notas: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  // Supabase no lanza excepción cuando RLS filtra un update — solo afecta 0
  // filas (bug pagado en B6). Por eso se revisa el .select() de vuelta.
  const { data, error } = await supabase
    .from("cuentas")
    .update({ notas: notas.trim() || null })
    .eq("id", cuentaId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Solo el dueño actual de la cartera puede editar el resumen" };
  }

  revalidatePath(`/comercial/cartera/${cuentaId}`);
  revalidatePath(`/gerencia/clientes/${cuentaId}`);
  return { error: null };
}

/**
 * Vincular el cliente a un RUC / DNI y corregir su razón social.
 *
 * Pedido de Darwin el 24-08, junto con la edición de contactos: «ahí también
 * debería poder vincularse a un RUC y/o razón social».
 *
 * Hace falta porque 5.158 de las ~16.000 cuentas están como SIN_DOC: cuando el
 * contacto entra por la web o por WhatsApp, Central lo registra con el nombre
 * de la persona y nada más. El RUC aparece después, cuando el comercial
 * conversa — y hasta hoy no había dónde anotarlo, así que la cotización salía
 * a nombre de una persona y sin número de documento, que es justo lo que
 * contabilidad necesita para armar el expediente.
 *
 * NO cambia una cotización ya emitida: su `cliente_snapshot` se congeló al
 * crearla (migración 0012). Corrige lo que salga de acá en adelante.
 */
export async function actualizarIdentidadCuenta(datos: {
  cuentaId: string;
  tipoDoc: TipoDocumento;
  numDoc: string;
  razonSocial: string;
}): Promise<{ error: string | null; avisoDuplicado?: string }> {
  const razonSocial = datos.razonSocial.trim().replace(/\s+/g, " ");
  if (!razonSocial) return { error: "La razón social no puede ir vacía" };

  const problema = errorDocumento(datos.tipoDoc, datos.numDoc);
  if (problema) return { error: problema };

  // Sin documento no se guarda número: dejarlo colgado haría creer que el
  // cliente está identificado cuando no lo está.
  const numDoc =
    datos.tipoDoc === "SIN_DOC"
      ? null
      : datos.tipoDoc === "CE"
        ? datos.numDoc.trim()
        : datos.numDoc.replace(/\D/g, "");

  const supabase = await createClient();

  // Avisar —no bloquear— si otra cuenta ya tiene ese documento. Es el problema
  // de las 494 cuentas partidas en dos: fusionarlas es una decisión con plata
  // de por medio (a quién le queda el historial de ventas), no algo que deba
  // pasar solo porque alguien tecleó un RUC.
  let avisoDuplicado: string | undefined;
  if (numDoc) {
    const { data: otras } = await supabase
      .from("cuentas")
      .select("id, razon_social")
      .eq("num_doc", numDoc)
      .neq("id", datos.cuentaId)
      .limit(2);
    if (otras && otras.length > 0) {
      avisoDuplicado = `Ese documento ya lo tiene ${otras[0].razon_social}${otras.length > 1 ? ` y ${otras.length - 1} más` : ""}. Quedaron dos fichas del mismo cliente: avise para unirlas.`;
    }
  }

  // `.select()` de vuelta: cuando RLS filtra, el update no da error, afecta
  // cero filas (mismo bug de siempre).
  const { data, error } = await supabase
    .from("cuentas")
    .update({ tipo_doc: datos.tipoDoc, num_doc: numDoc, razon_social: razonSocial })
    .eq("id", datos.cuentaId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Solo el dueño actual de la cartera puede corregir los datos del cliente" };
  }

  revalidatePath("/comercial", "layout");
  revalidatePath("/gerencia", "layout");
  return { error: null, avisoDuplicado };
}
