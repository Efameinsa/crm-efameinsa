import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { NuevoProtocoloDeStock } from "@/components/crm/protocolo-stock";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VISTAS: Record<string, string> = {
  "": "Todos",
  pedidos: "De pedidos",
  stock: "De equipos en stock",
  borradores: "Sin terminar",
};

type Fila = {
  clave: string;
  href: string;
  ref: string | null;
  de: "pedido" | "stock";
  cliente: string;
  equipo: string;
  serie: string | null;
  tecnico: string | null;
  fecha: string | null;
  estado: { texto: string; tono: "ok" | "pendiente" | "info" };
};

const titulo = (descripcion: string | null) => (descripcion ?? "").split("\n")[0].slice(0, 120);
const sinRuc = (t: string | null) => (t ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");

/**
 * LOS PROTOCOLOS DEL ALMACÉN, JUNTOS (Lesly, 14-10: «que en la vista de
 * almacén estén los protocolos»). Los de cada máquina de los pedidos (0260 →
 * 0471) y los de los equipos en stock (0474), con su N.º, serie, técnico y si
 * ya están terminados. Cada uno abre su informe con la hoja de chequeo.
 */
export default async function ProtocolosAlmacenPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string; nuevo?: string }> }) {
  await requerirPerfil();
  const sp = await searchParams;
  const ver = sp.ver && sp.ver in VISTAS ? sp.ver : "";
  const q = (sp.q ?? "").trim();
  const supabase = await createClient();

  const [{ data: dePedidos }, { data: deStock }] = await Promise.all([
    ver === "stock"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("pedido_equipos")
          .select("id, servicio_id, descripcion, serie, parte_nombre, protocolo_ref, protocolo_datos, protocolo_fecha, prueba_lista_at, created_at, servicios_postventa(cliente_texto)")
          .or("protocolo_ref.not.is.null,prueba_lista_at.not.is.null,protocolo_fotos.neq.[]")
          .order("created_at", { ascending: false })
          .limit(400),
    ver === "pedidos"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("protocolos_stock")
          .select("id, descripcion, serie, protocolo_ref, protocolo_datos, protocolo_fecha, terminado_at, heredado_por, created_at")
          .order("created_at", { ascending: false })
          .limit(400),
  ]);

  type DePedido = {
    id: string;
    servicio_id: string;
    descripcion: string;
    serie: string | null;
    parte_nombre: string | null;
    protocolo_ref: string | null;
    protocolo_datos: { principal?: { tecnico?: string; fecha_ejecucion?: string } } | null;
    protocolo_fecha: string | null;
    prueba_lista_at: string | null;
    created_at: string;
    servicios_postventa: { cliente_texto: string | null } | null;
  };
  type DeStock = {
    id: string;
    descripcion: string;
    serie: string;
    protocolo_ref: string | null;
    protocolo_datos: { principal?: { tecnico?: string; fecha_ejecucion?: string } } | null;
    protocolo_fecha: string | null;
    terminado_at: string | null;
    heredado_por: string | null;
    created_at: string;
  };

  const filas: Fila[] = [
    ...((dePedidos ?? []) as unknown as DePedido[]).map((e) => ({
      clave: `p-${e.id}`,
      href: `/pedidos/${e.servicio_id}/protocolo`,
      ref: e.protocolo_ref,
      de: "pedido" as const,
      cliente: sinRuc(e.servicios_postventa?.cliente_texto ?? null),
      equipo: e.parte_nombre ? `${e.parte_nombre} · ${titulo(e.descripcion)}` : titulo(e.descripcion),
      serie: e.serie,
      tecnico: e.protocolo_datos?.principal?.tecnico ?? null,
      fecha: e.protocolo_datos?.principal?.fecha_ejecucion ?? e.protocolo_fecha ?? e.prueba_lista_at ?? e.created_at,
      estado: e.prueba_lista_at ? { texto: "Probada y embalada", tono: "ok" as const } : { texto: "Borrador", tono: "pendiente" as const },
    })),
    ...((deStock ?? []) as unknown as DeStock[]).map((s) => ({
      clave: `s-${s.id}`,
      href: `/almacen/protocolos/stock/${s.id}`,
      ref: s.protocolo_ref,
      de: "stock" as const,
      cliente: "Stock del almacén",
      equipo: titulo(s.descripcion),
      serie: s.serie,
      tecnico: s.protocolo_datos?.principal?.tecnico ?? null,
      fecha: s.protocolo_datos?.principal?.fecha_ejecucion ?? s.protocolo_fecha ?? s.created_at,
      estado: s.heredado_por
        ? { texto: "Pasó a un pedido", tono: "info" as const }
        : s.terminado_at
          ? { texto: "Terminado · en stock", tono: "ok" as const }
          : { texto: "Borrador", tono: "pendiente" as const },
    })),
  ]
    .filter((f) => ver !== "borradores" || f.estado.tono === "pendiente")
    .filter((f) => {
      if (!q) return true;
      const t = q.toUpperCase();
      return [f.ref, f.cliente, f.equipo, f.serie, f.tecnico].some((x) => (x ?? "").toUpperCase().includes(t));
    })
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));

  const enlace = (cambio: { ver?: string; q?: string }) => {
    const p = new URLSearchParams();
    const v = cambio.ver ?? ver;
    const b = cambio.q ?? q;
    if (v) p.set("ver", v);
    if (b) p.set("q", b);
    const s = p.toString();
    return `/almacen/protocolos${s ? `?${s}` : ""}`;
  };

  return (
    <SeccionPanel titulo="Protocolos de prueba" accion={<NuevoProtocoloDeStock abiertoAlEntrar={sp.nuevo === "1"} />}>
      <p className="mb-3 text-xs text-muted-foreground">
        Los protocolos de cada máquina de los pedidos y los de los equipos en stock. El de stock se hace por serie y, al terminarlo, pasa solo al
        pedido donde salga esa serie.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {Object.entries(VISTAS).map(([k, v]) => (
          <Link
            key={k}
            href={enlace({ ver: k })}
            className={cn("rounded-full border px-2.5 py-0.5 text-xs", ver === k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary")}
          >
            {v}
          </Link>
        ))}
        <form action="/almacen/protocolos" className="ml-auto flex items-center gap-1.5">
          {ver && <input type="hidden" name="ver" value={ver} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Serie, N.º, cliente o técnico"
            className="h-8 w-56 rounded-md border border-input bg-background px-2 text-xs"
          />
        </form>
      </div>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {q ? `Ningún protocolo coincide con «${q}».` : "No hay protocolos en esta vista. Los de stock se crean con «Protocolo de equipo en stock»."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {filas.map((f) => (
            <li key={f.clave} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
              <span className="w-24 flex-none font-mono text-xs text-muted-foreground">{f.ref ? `N.º ${f.ref}` : "sin N.º"}</span>
              <span className="min-w-0 flex-1">
                <Link href={f.href} className="block font-semibold text-foreground hover:underline">
                  {f.cliente}
                </Link>
                <span className="line-clamp-1 break-words text-xs text-muted-foreground">
                  {f.equipo}
                  {f.serie ? ` · serie ${f.serie}` : ""}
                  {f.tecnico ? ` · ${f.tecnico}` : ""}
                  {f.fecha ? ` · ${fechaLima(f.fecha.length === 10 ? `${f.fecha}T12:00:00-05:00` : f.fecha)}` : ""}
                </span>
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  f.de === "stock" ? "bg-secondary text-foreground" : "border border-border text-muted-foreground",
                )}
              >
                {f.de === "stock" ? "Stock" : "Pedido"}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  f.estado.tono === "ok" ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : f.estado.tono === "pendiente" ? "bg-amber-500/10 text-amber-800" : "bg-secondary text-muted-foreground",
                )}
              >
                {f.estado.texto}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SeccionPanel>
  );
}
