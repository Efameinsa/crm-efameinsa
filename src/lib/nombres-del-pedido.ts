import { createAdminClient } from "@/lib/supabase/admin";
import { idsDePersonasDelPedido, type ServicioPostventa } from "@/lib/postventa";

/**
 * Los nombres de quienes movieron el pedido (0473), para que cada etapa diga
 * quién la hizo. Con la clave de servicio: el almacén o postventa no siempre
 * pueden leer el perfil de Finanzas o de gerencia, y un nombre no es secreto.
 */
export async function nombresDelPedido(s: Partial<ServicioPostventa>): Promise<Record<string, string>> {
  const ids = idsDePersonasDelPedido(s);
  if (!ids.length) return {};
  const { data } = await createAdminClient().from("perfiles").select("id, nombre").in("id", ids);
  return Object.fromEntries((data ?? []).map((p) => [p.id as string, String(p.nombre ?? "")]));
}
