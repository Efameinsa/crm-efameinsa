import { createClient } from "@/lib/supabase/server";
import { apurosDeRutas, noLeidosDeChats, rutasDePedidos, rutasDelCaso } from "@/lib/mapa-recorrido-datos";
import { requerirPerfil } from "@/lib/auth";
import { MapaRecorrido } from "@/components/crm/mapa-recorrido";

/**
 * La sección «Mapa» lista para poner en cualquier pantalla (Santos, 23-10):
 * el caso de postventa, la ficha del pedido de postventa, almacén y Finanzas,
 * y el cierre y los pagos del comercial. Lee con la sesión de quien mira.
 *
 * - `atencionId`: el caso, su apertura de servicio y sus recepciones en planta.
 * - `pedidos`: uno o varios pedidos.
 * - `cierreId`: los pedidos que nacieron de ese cierre (el original y su «otro circuito», 0501).
 * - `enlace`: a dónde lleva el título de cada pedido en esa pantalla, con «{id}» donde va el pedido.
 */
export async function MapaRecorridoSeccion({
  atencionId,
  pedidos,
  cierreId,
  ruta,
  enlace = null,
  abierto = false,
}: {
  atencionId?: string;
  pedidos?: (string | null | undefined)[];
  cierreId?: string;
  ruta: string;
  enlace?: string | null;
  abierto?: boolean;
}) {
  const supabase = await createClient();
  const ids = [...new Set((pedidos ?? []).filter((x): x is string => Boolean(x)))];
  if (cierreId) {
    const { data } = await supabase.from("servicios_postventa").select("id").eq("informe_cierre_id", cierreId).order("created_at");
    ids.push(...(data ?? []).map((f) => f.id as string).filter((id) => !ids.includes(id)));
  }
  const rutas = atencionId
    ? await rutasDelCaso(supabase, atencionId)
    : await rutasDePedidos(supabase, ids, (id) => (enlace ? enlace.replace("{id}", id) : null));
  if (rutas.length === 0) return null;
  const perfil = await requerirPerfil();
  const [apuros, noLeidos] = await Promise.all([apurosDeRutas(supabase, rutas), noLeidosDeChats(supabase, rutas, perfil.id)]);
  return <MapaRecorrido rutas={rutas} apuros={apuros} ruta={ruta} abierto={abierto} noLeidos={noLeidos} />;
}
