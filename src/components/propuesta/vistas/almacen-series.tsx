import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FilaTrabajo, Grupo, Vacio, haceCuanto, type DatosFila } from "@/components/propuesta/kit";

/**
 * SERIES POR INGRESAR (propuesta v2, 23-09).
 *
 * Central pide las series antes de lanzar el pedido (0290): el almacén las lee
 * en la placa y las escribe. Esta lista es solo eso —los pedidos con alguna
 * máquina todavía sin serie—, con lo más viejo arriba. Se escribe en el
 * pedido; acá solo se lee.
 */
type Cliente = Awaited<ReturnType<typeof createClient>>;
const sinRuc = (s: string | null | undefined) => (s ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");
const primeraLinea = (s: string | null | undefined) => (s ?? "").split("\n")[0].trim();
const UN_DIA = 86_400_000;

interface PedidoSeries {
  id: string;
  cliente: string;
  pedidasAt: string;
  total: number;
  faltan: string[];
  /** Pedidas hace más de 24 horas. */
  viejo: boolean;
}

/** Trozos de 100: un `.in` con cientos de ids revienta la URL y vuelve vacío. */
async function equiposDe(supabase: Cliente, ids: string[]) {
  const filas: { servicio_id: string; descripcion: string; serie: string | null; orden: number }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase.from("pedido_equipos").select("servicio_id, descripcion, serie, orden").in("servicio_id", ids.slice(i, i + 100)).order("orden");
    filas.push(...((data ?? []) as typeof filas));
  }
  return filas;
}

export async function pedidosConSeriesPendientes(supabase: Cliente): Promise<PedidoSeries[]> {
  const { data } = await supabase
    .from("servicios_postventa")
    .select("id, cliente_texto, series_pedidas_at")
    .not("series_pedidas_at", "is", null)
    .is("cerrado_at", null)
    .order("series_pedidas_at", { ascending: true })
    .limit(300);
  const pedidos = (data ?? []) as { id: string; cliente_texto: string | null; series_pedidas_at: string }[];
  if (pedidos.length === 0) return [];
  const ahora = Date.now();
  const equipos = await equiposDe(supabase, pedidos.map((p) => p.id));
  const porPedido = new Map<string, typeof equipos>();
  for (const e of equipos) porPedido.set(e.servicio_id, [...(porPedido.get(e.servicio_id) ?? []), e]);
  return pedidos
    .map((p) => {
      const lista = porPedido.get(p.id) ?? [];
      return { id: p.id, cliente: sinRuc(p.cliente_texto), pedidasAt: p.series_pedidas_at, total: lista.length, viejo: ahora - new Date(p.series_pedidas_at).getTime() > UN_DIA, faltan: lista.filter((e) => !e.serie).map((e) => primeraLinea(e.descripcion)) };
    })
    .filter((p) => p.faltan.length > 0);
}

export async function conteo(supabase: Cliente): Promise<number> {
  return (await pedidosConSeriesPendientes(supabase)).length;
}
export const alerta = true;

function fila(p: PedidoSeries): DatosFila {
  const viejo = p.viejo;
  const n = p.faltan.length;
  // Las descripciones repetidas se cuentan: «2 × Lavadora LAV180».
  const cuenta = new Map<string, number>();
  for (const d of p.faltan) cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
  const equipos = [...cuenta.entries()].map(([d, k]) => (k > 1 ? `${k} × ${d}` : d)).join(" · ");
  return {
    titulo: p.cliente,
    href: `/almacen/pedidos/${p.id}`,
    sub: equipos || "Máquinas del pedido",
    estado: { texto: p.total > 0 ? `Faltan ${n} de ${p.total}` : `Faltan ${n}`, tono: viejo ? "atencion" : "info" },
    espera: "Central espera las series para lanzar el pedido",
    edad: `Pedidas ${haceCuanto(p.pedidasAt)}`,
    edadTono: viejo ? "atencion" : "neutro",
    tono: viejo ? "atencion" : "neutro",
    accion: { etiqueta: n === 1 ? "Registrar la serie" : "Registrar series", href: `/almacen/pedidos/${p.id}` },
  };
}

export default async function AlmacenSeries() {
  const supabase = await createClient();
  const pedidos = await pedidosConSeriesPendientes(supabase);
  const viejas = pedidos.filter((p) => p.viejo);
  const nuevas = pedidos.filter((p) => !p.viejo);

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Escriba cada serie tal como se lee en la placa de la máquina. <b>Una vez guardada queda fija</b>: para corregirla hace falta el código de operaciones y el
          motivo.
        </span>
      </p>

      {pedidos.length === 0 ? (
        <Vacio
          titulo="No hay generación de código pendiente"
          porque="Central pide las series antes de lanzar un pedido. Cuando lo haga, el pedido aparece acá con las máquinas que faltan."
          accion={{ etiqueta: "Ver los pedidos en curso", href: "/almacen/pedidos" }}
        />
      ) : (
        <>
          {viejas.length > 0 && (
            <Grupo titulo="Pedidas hace más de un día" ayuda="Primero estas: el pedido no avanza sin sus series." conteo={viejas.length} tono="atencion">
              {viejas.map((p) => (
                <FilaTrabajo key={p.id} f={fila(p)} />
              ))}
            </Grupo>
          )}
          {nuevas.length > 0 && (
            <Grupo titulo="Nuevas" ayuda="Pedidas en las últimas 24 horas." conteo={nuevas.length} tono="info">
              {nuevas.map((p) => (
                <FilaTrabajo key={p.id} f={fila(p)} />
              ))}
            </Grupo>
          )}
        </>
      )}
    </div>
  );
}
