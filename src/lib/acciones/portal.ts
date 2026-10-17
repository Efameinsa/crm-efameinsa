"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";

/**
 * Lo que el personal hace con Mi cuenta de efameinsa.com desde el CRM
 * (contrato «Experiencia del cliente», 17-10; migraciones 0525 y 0526):
 * marcar los dos pasos del técnico y responder el chat del cliente.
 *
 * Todo va con la sesión de quien hace clic: las reglas de quién puede viven
 * en la base (marcar_tecnico_pedido / marcar_tecnico_caso, y la RLS de
 * portal_mensajes, que deja ver y responder a quien ya ve la ficha). Cada
 * clic queda en el registro de acciones (0513).
 */

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");

function comoFalla(mensaje: string) {
  // Antes de aplicar la 0525/0526 la función o la tabla no existen: se dice con palabras.
  if (/does not exist|could not find|schema cache|PGRST20[0-9]/i.test(mensaje)) {
    return { error: "Esta parte todavía no está activa en el sistema. Avise a operaciones." };
  }
  return { error: limpiar(mensaje) };
}

export async function marcarTecnico(
  donde: "pedido" | "caso",
  id: string,
  paso: "salio" | "llego",
  deshacer = false,
): Promise<{ error: string | null; cuando?: string | null }> {
  await requerirPerfil();
  if (paso !== "salio" && paso !== "llego") return { error: "Paso desconocido" };
  const supabase = await createClient();
  const { data, error } =
    donde === "pedido"
      ? await supabase.rpc("marcar_tecnico_pedido", { p_servicio: id, p_paso: paso, p_deshacer: deshacer })
      : await supabase.rpc("marcar_tecnico_caso", { p_atencion: id, p_paso: paso, p_deshacer: deshacer });
  if (error) return comoFalla(error.message);
  revalidatePath(donde === "pedido" ? `/postventa/pedidos/${id}` : `/postventa/atenciones/${id}`);
  if (donde === "pedido") revalidatePath(`/nuevo/pedido/${id}`);
  return { error: null, cuando: (data as string | null) ?? null };
}

export async function responderMensajeMiCuenta(datos: {
  cuentaId: string;
  texto: string;
  servicioId?: string | null;
  atencionId?: string | null;
}): Promise<{ error: string | null }> {
  const perfil = await requerirPerfil();
  const texto = datos.texto.trim();
  if (texto.length < 1) return { error: "Escriba la respuesta." };
  if (texto.length > 2000) return { error: "La respuesta pasa de 2000 caracteres: pártala en dos." };
  const supabase = await createClient();
  const { error } = await supabase.from("portal_mensajes").insert({
    cuenta_id: datos.cuentaId,
    autor: "empresa",
    autor_id: perfil.id,
    autor_nombre: perfil.nombre,
    texto,
    servicio_id: datos.servicioId ?? null,
    atencion_id: datos.atencionId ?? null,
  });
  if (error) {
    if (/row-level security|permission denied/i.test(error.message)) {
      return { error: "No puede responder en esta ficha: no es de su cartera ni de su área." };
    }
    return comoFalla(error.message);
  }
  if (datos.servicioId) revalidatePath(`/postventa/pedidos/${datos.servicioId}`);
  if (datos.atencionId) revalidatePath(`/postventa/atenciones/${datos.atencionId}`);
  return { error: null };
}

/** Al abrir la sección: lo que escribió el cliente queda leído. */
export async function marcarMensajesLeidos(ids: string[]): Promise<{ error: string | null }> {
  await requerirPerfil();
  const validos = ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)).slice(0, 200);
  if (validos.length === 0) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("portal_mensajes")
    .update({ leido_at: new Date().toISOString() })
    .in("id", validos)
    .eq("autor", "cliente")
    .is("leido_at", null);
  if (error) return comoFalla(error.message);
  return { error: null };
}
