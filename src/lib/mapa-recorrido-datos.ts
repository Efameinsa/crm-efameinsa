import type { SupabaseClient } from "@supabase/supabase-js";
import { nombresDelPedido } from "@/lib/nombres-del-pedido";
import { sinPrecios, type ServicioPostventa } from "@/lib/postventa";
import type { Atencion } from "@/lib/atenciones";
import { rutaDeRecepcion, rutaDelCaso, rutaDelPedido, type RutaMapa, type TipoRuta } from "@/lib/mapa-recorrido";

/**
 * Lo que el mapa del recorrido necesita leer de la base. Todo con el cliente
 * de quien mira (la RLS decide qué ve); el mapa no tiene datos propios salvo
 * los apuros (0591).
 */

export type ApuroMapa = { at: string; n: number; quien: string | null };
export type ApurosMapa = Record<string, ApuroMapa>;

export const claveApuro = (tipo: TipoRuta, id: string, area: string) => `${tipo}:${id}:${area}`;

/** Las rutas de uno o varios pedidos (los de un cierre pueden ser dos: «otro circuito», 0501). */
export async function rutasDePedidos(supabase: SupabaseClient, ids: string[], enlace: (id: string) => string | null = () => null): Promise<RutaMapa[]> {
  if (ids.length === 0) return [];
  const [{ data: pedidos }, { data: sinSerie }, { data: facturas }] = await Promise.all([
    supabase.from("servicios_postventa").select("*").in("id", ids),
    supabase.from("pedido_equipos").select("servicio_id").in("servicio_id", ids).is("serie", null).is("parte_de", null),
    supabase.from("facturas_pedido").select("servicio_id").in("servicio_id", ids).eq("tipo", "factura").is("anulada_at", null),
  ]);
  const cuenta = (filas: { servicio_id: string }[] | null, id: string) => (filas ?? []).filter((f) => f.servicio_id === id).length;
  const rutas: RutaMapa[] = [];
  for (const crudo of (pedidos ?? []) as unknown as ServicioPostventa[]) {
    // El mapa no muestra montos: con las cifras tapadas el pago se lee de `estadoPago`, como en la ficha.
    const s = sinPrecios(crudo);
    const nombres = await nombresDelPedido(crudo).catch(() => ({}) as Record<string, string>);
    rutas.push(rutaDelPedido(s, { sinSerie: cuenta(sinSerie, s.id), facturas: cuenta(facturas, s.id), nombres }, enlace(s.id)));
  }
  // En el orden en que se pidieron (el pedido original antes que su «otro circuito»).
  return ids.map((id) => rutas.find((r) => r.id === id)).filter((r): r is RutaMapa => Boolean(r));
}

/** El caso, su apertura de servicio (si la tiene) y sus recepciones en planta. */
export async function rutasDelCaso(supabase: SupabaseClient, atencionId: string): Promise<RutaMapa[]> {
  const { data: a } = await supabase.from("atenciones").select("*").eq("id", atencionId).maybeSingle();
  if (!a) return [];
  const caso = a as unknown as Atencion & { id: string; codigo: string | null; servicio_id: string | null };
  const [pedidos, { data: recepciones }] = await Promise.all([
    caso.servicio_id ? rutasDePedidos(supabase, [caso.servicio_id], (id) => `/postventa/pedidos/${id}`) : Promise.resolve([]),
    supabase
      .from("recepciones_equipo")
      .select("id, codigo, equipo_texto, created_at, recibido_at, revisado_at, listo_at, resultado")
      .eq("atencion_id", atencionId)
      .is("anulada_at", null)
      .order("created_at"),
  ]);
  return [
    rutaDelCaso(caso, null),
    ...pedidos,
    ...((recepciones ?? []) as Parameters<typeof rutaDeRecepcion>[0][]).map(rutaDeRecepcion),
  ];
}

/** El último apuro a cada área de cada ruta, con cuántos van y quién lo mandó. */
export async function apurosDeRutas(supabase: SupabaseClient, rutas: RutaMapa[]): Promise<ApurosMapa> {
  const ids = (tipo: TipoRuta) => rutas.filter((r) => r.tipo === tipo).map((r) => r.id);
  const consultas = (
    [
      ["pedido", "servicio_id"],
      ["caso", "atencion_id"],
      ["recepcion", "recepcion_id"],
    ] as const
  )
    .filter(([tipo]) => ids(tipo).length > 0)
    .map(([tipo, col]) =>
      supabase
        .from("apuros_del_mapa")
        .select(`${col}, area, created_at, perfiles:enviado_por(nombre)`)
        .in(col, ids(tipo))
        .order("created_at", { ascending: false })
        .limit(200)
        .then(({ data }) => ({ tipo, col, data: (data ?? []) as unknown as Record<string, unknown>[] })),
    );
  const out: ApurosMapa = {};
  for (const { tipo, col, data } of await Promise.all(consultas)) {
    for (const f of data) {
      const k = claveApuro(tipo, f[col] as string, f.area as string);
      const quien = (f.perfiles as { nombre?: string } | null)?.nombre ?? null;
      if (out[k]) out[k].n++;
      else out[k] = { at: f.created_at as string, n: 1, quien };
    }
  }
  return out;
}

/**
 * Mensajes sin leer del chat de cada ruta (0592): lo que escribieron otros
 * después de la última vez que esta persona abrió el chat.
 */
export async function noLeidosDeChats(supabase: SupabaseClient, rutas: RutaMapa[], userId: string): Promise<Record<string, number>> {
  const conChat = rutas.filter((r) => r.tipo !== "recepcion");
  if (!conChat.length) return {};
  const { data: lecturas } = await supabase.from("chat_lecturas").select("tipo, objeto_id, leido_hasta").eq("user_id", userId).in("objeto_id", conChat.map((r) => r.id));
  const hasta = new Map(((lecturas ?? []) as { tipo: string; objeto_id: string; leido_hasta: string }[]).map((l) => [`${l.tipo}:${l.objeto_id}`, l.leido_hasta]));
  const out: Record<string, number> = {};
  await Promise.all(
    conChat.map(async (r) => {
      let q = supabase
        .from("chat_mensajes")
        .select("id", { count: "exact", head: true })
        .eq(r.tipo === "caso" ? "atencion_id" : "servicio_id", r.id)
        .neq("autor_id", userId);
      const h = hasta.get(`${r.tipo}:${r.id}`);
      if (h) q = q.gt("created_at", h);
      const { count } = await q;
      out[`${r.tipo}:${r.id}`] = count ?? 0;
    }),
  );
  return out;
}
