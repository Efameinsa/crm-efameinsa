// EL AVISO LLEVA AL PEDIDO, NO A LA LISTA (buzón, Central 17-10: «ver el aviso
// nuevo no permite ingresar directo hacia el cliente para imprimir la factura o
// liquidación»). «Liquidación actualizada · ABACHI» abría /central/cierres en
// «Por liberar», donde ese pedido ni salía. Ahora el enlace busca el pedido
// (por su N.º, o el del cierre si todavía no tiene) en «Todos» y salta a su
// tarjeta, que trae «Ver la liquidación» y las facturas.

import type { createClient } from "@/lib/supabase/server";

/** El enlace a la tarjeta de un cierre en /central/cierres, buscándolo por `q`. */
export function enlaceCierreCentral(informeId: string | null | undefined, buscar: string | null | undefined): string {
  if (!informeId) return "/central/cierres?ver=todos";
  const q = (buscar ?? "").trim();
  return `/central/cierres?${new URLSearchParams({ ver: "todos", ...(q ? { q } : {}) })}#c-${informeId}`;
}

/** El mismo enlace a partir del pedido (servicios_postventa). */
export async function enlaceCierreDelPedido(supabase: Awaited<ReturnType<typeof createClient>>, servicioId: string): Promise<string> {
  const { data } = await supabase
    .from("servicios_postventa")
    .select("informe_cierre_id, numero_pedido_erp, informes_cierre!servicios_postventa_informe_cierre_id_fkey(codigo)")
    .eq("id", servicioId)
    .maybeSingle();
  const p = data as { informe_cierre_id: string | null; numero_pedido_erp: string | null; informes_cierre: { codigo: string | null } | null } | null;
  return enlaceCierreCentral(p?.informe_cierre_id, p?.numero_pedido_erp || p?.informes_cierre?.codigo);
}
