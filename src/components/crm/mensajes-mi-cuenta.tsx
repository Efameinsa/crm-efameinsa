import { createClient } from "@/lib/supabase/server";
import { ChatMiCuenta, type MensajeMiCuenta } from "@/components/crm/chat-mi-cuenta";

/**
 * «MENSAJES DE MI CUENTA» (0526): el chat que el cliente tiene en su perfil de
 * efameinsa.com, leído y respondido desde la ficha y desde el pedido o el caso.
 *
 * Lee con la sesión de quien mira: la RLS deja ver los mensajes de las fichas
 * que esa persona ya ve. Si la tabla todavía no existe (antes de la 0526) o
 * no hay mensajes y no se pidió mostrarla vacía, la sección no aparece.
 */
export async function MensajesMiCuenta({
  cuentaId,
  servicioId = null,
  atencionId = null,
  siempre = false,
}: {
  cuentaId: string | null | undefined;
  /** En la pantalla del pedido: solo los de ese pedido (y la respuesta queda ligada a él). */
  servicioId?: string | null;
  atencionId?: string | null;
  /** Mostrarla aunque no haya mensajes (en la ficha del cliente). */
  siempre?: boolean;
}) {
  if (!cuentaId) return null;
  const supabase = await createClient();
  let q = supabase
    .from("portal_mensajes")
    .select("id, autor, autor_nombre, texto, created_at, leido_at, servicio_id, atencion_id")
    .eq("cuenta_id", cuentaId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (servicioId) q = q.eq("servicio_id", servicioId);
  if (atencionId) q = q.eq("atencion_id", atencionId);
  const { data, error } = await q;
  if (error) return null;
  const mensajes = ((data ?? []) as MensajeMiCuenta[]).reverse();
  if (mensajes.length === 0 && !siempre) return null;
  return <ChatMiCuenta cuentaId={cuentaId} servicioId={servicioId} atencionId={atencionId} mensajes={mensajes} />;
}
