"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Editar los datos de contacto de un cliente.
 *
 * Pedido de Darwin el 24-08, primer día de uso real: «la parte de contacto no
 * se puede editar, debería poderse, para corregir el nombre — esa información
 * es lo que se va a jalar a la cotización».
 *
 * Es literal: el PDF imprime "Atención: <nombre>" y el teléfono y correo del
 * contacto principal. Y 13.371 de los 13.570 contactos vienen del histórico
 * escritos enteros en MAYÚSCULAS, así que hasta hoy el cliente recibía su
 * nombre a gritos y no había forma de arreglarlo.
 *
 * También lo respalda el ing. Carlos en la charla del 24-08, hablando de
 * derivaciones: «si has recibido la llamada con otra persona completamente
 * distinta, eso sí tiene que permitirte digitar la persona de contacto. No
 * vamos a confiar solamente en lo que arroja la ficha».
 *
 * La cotización YA EMITIDA no cambia: su `cliente_snapshot` se congeló al
 * crearla, que es la regla de inmutabilidad de siempre. Esto arregla lo que
 * saldrá de acá en adelante.
 *
 * La dirección se sumó el 26-08, a pedido de Darwin: un cliente puede tener
 * varias sedes/contactos en lugares distintos, así que va por contacto y no
 * por cuenta — la cotización imprime la del contacto principal (migración
 * que agrega `contactos.direccion` y cambia `crear_cotizacion`). Si el
 * principal no tiene dirección cargada, se sigue usando `cuentas.direccion`
 * (el dato que ya traían las cuentas importadas) para no perder lo que ya
 * salía impreso.
 */
export async function guardarContacto(datos: {
  contactoId?: string;
  cuentaId: string;
  nombre: string;
  cargo: string;
  telefono: string;
  email: string;
  documento: string;
  direccion: string;
  esPrincipal: boolean;
}): Promise<{ error: string | null }> {
  const nombre = datos.nombre.trim().replace(/\s+/g, " ");
  if (!nombre) return { error: "El nombre del contacto no puede ir vacío" };

  const supabase = await createClient();

  const campos = {
    nombre,
    cargo: datos.cargo.trim() || null,
    telefono: datos.telefono.trim() || null,
    email: datos.email.trim() || null,
    documento: datos.documento.trim() || null,
    direccion: datos.direccion.trim() || null,
    es_principal: datos.esPrincipal,
  };

  // Un solo principal por cuenta: es el que la cotización usa para el
  // "Atención:", el teléfono y el correo. Dos principales harían que el
  // documento dependiera del orden en que vuelvan las filas.
  if (datos.esPrincipal) {
    let quitar = supabase.from("contactos").update({ es_principal: false }).eq("cuenta_id", datos.cuentaId);
    if (datos.contactoId) quitar = quitar.neq("id", datos.contactoId);
    const { error } = await quitar;
    if (error) return { error: error.message };
  }

  // `.select()` a propósito: si RLS filtra la fila, el update no devuelve
  // error, devuelve cero filas. Sin esto, el comercial vería "guardado" y no
  // se habría guardado nada.
  if (datos.contactoId) {
    const { data, error } = await supabase
      .from("contactos")
      .update(campos)
      .eq("id", datos.contactoId)
      .eq("cuenta_id", datos.cuentaId)
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) {
      return { error: "No se pudo guardar: este cliente no está en su cartera" };
    }
  } else {
    const { data, error } = await supabase
      .from("contactos")
      .insert({ ...campos, cuenta_id: datos.cuentaId })
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) {
      return { error: "No se pudo agregar: este cliente no está en su cartera" };
    }
  }

  revalidatePath("/comercial", "layout");
  revalidatePath("/gerencia", "layout");
  return { error: null };
}

/**
 * Borra un contacto.
 *
 * No se permite borrar el último: la cotización se quedaría sin a quién
 * dirigirse y el PDF saldría sin "Atención:".
 */
export async function eliminarContacto(datos: {
  contactoId: string;
  cuentaId: string;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("contactos")
    .select("id", { count: "exact", head: true })
    .eq("cuenta_id", datos.cuentaId);
  if ((count ?? 0) <= 1) {
    return { error: "Es el único contacto del cliente: corríjalo en vez de borrarlo" };
  }

  const { data, error } = await supabase
    .from("contactos")
    .delete()
    .eq("id", datos.contactoId)
    .eq("cuenta_id", datos.cuentaId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "No se pudo borrar: este cliente no está en su cartera" };
  }

  revalidatePath("/comercial", "layout");
  revalidatePath("/gerencia", "layout");
  return { error: null };
}
