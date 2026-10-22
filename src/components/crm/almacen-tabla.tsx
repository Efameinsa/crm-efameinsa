"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "@/components/enlace";
import { moverEquipo, ponerEmpresa } from "@/lib/acciones/inventario";
import { cn } from "@/lib/utils";

/**
 * LA TABLA DEL ALMACÉN, EN DOS LECTURAS (UI/UX 22-10, después de ver la pantalla con 202 máquinas).
 *
 * «Por código» es la lectura de todos los días: una fila por código con cuántas
 * hay (disponibles y reservadas) y, al abrirla, sus series. Es la misma suma que
 * ve el comercial en el catálogo (Carlos: 50 Titan Max = 50 series). «Por serie»
 * es la lista plana numerada para contar, cotejar o imprimir, de a 100.
 *
 * La misma tabla sirve al almacén (edita empresa, libera, da de baja) y al
 * comercial (solo mira, sin fecha de ingreso ni para quién está reservada).
 */

export interface MaquinaTabla {
  id: string;
  serie: string;
  estado: "disponible" | "reservado" | "despachado" | "baja";
  codigo: string | null;
  marca: string | null;
  modelo: string;
  descripcion: string;
  ubicacion: string | null;
  ingreso: string;
  salida: string | null;
  empresa: string | null;
  item: string | null;
  proveedor: string | null;
  cliente: string | null;
  pedido: string | null;
  servicioId: string | null;
  porPedido: boolean;
}

export const ESTADO_MAQUINA: Record<MaquinaTabla["estado"], { texto: string; clase: string }> = {
  disponible: { texto: "Disponible", clase: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  reservado: { texto: "Reservada", clase: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  despachado: { texto: "Despachada", clase: "bg-secondary text-muted-foreground" },
  baja: { texto: "De baja", clase: "bg-secondary text-muted-foreground" },
};

export const fechaCorta = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

export interface OpcionesTabla {
  /** El almacén y gerencia editan; el comercial solo mira. */
  puedeEditar: boolean;
  /** El comercial no ve la fecha de ingreso ni para quién está reservada (Carlos 22-10). */
  verIngreso: boolean;
  verCliente: boolean;
}

interface Grupo {
  clave: string;
  codigo: string | null;
  marca: string | null;
  modelo: string;
  descripcion: string;
  proveedor: string | null;
  disponibles: number;
  reservadas: number;
  despachadas: number;
  maquinas: MaquinaTabla[];
}

export function agruparPorCodigo(filas: MaquinaTabla[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const f of filas) {
    const clave = f.codigo ?? `${f.marca ?? ""} ${f.modelo}`;
    const g = mapa.get(clave) ?? { clave, codigo: f.codigo, marca: f.marca, modelo: f.modelo, descripcion: f.descripcion, proveedor: f.proveedor, disponibles: 0, reservadas: 0, despachadas: 0, maquinas: [] };
    if (f.estado === "disponible") g.disponibles++;
    else if (f.estado === "reservado") g.reservadas++;
    else if (f.estado === "despachado") g.despachadas++;
    g.maquinas.push(f);
    mapa.set(clave, g);
  }
  return [...mapa.values()].sort((a, b) => (a.marca ?? "").localeCompare(b.marca ?? "") || a.modelo.localeCompare(b.modelo, "es", { numeric: true }) || (a.codigo ?? "").localeCompare(b.codigo ?? ""));
}

export function TablaPorCodigo({ filas, opciones }: { filas: MaquinaTabla[]; opciones: OpcionesTabla }) {
  const grupos = useMemo(() => agruparPorCodigo(filas), [filas]);
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());
  const alternar = (k: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-6 px-2 py-1.5" />
            <th className="px-2 py-1.5 text-left">Código</th>
            <th className="px-2 py-1.5 text-left">Equipo</th>
            <th className="px-2 py-1.5 text-left">Proveedor</th>
            <th className="px-2 py-1.5 text-right">Disponibles</th>
            <th className="px-2 py-1.5 text-right">Reservadas</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const abierto = abiertos.has(g.clave);
            return (
              <GrupoFila key={g.clave} g={g} abierto={abierto} alternar={() => alternar(g.clave)} opciones={opciones} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GrupoFila({ g, abierto, alternar, opciones }: { g: Grupo; abierto: boolean; alternar: () => void; opciones: OpcionesTabla }) {
  return (
    <>
      <tr className={cn("cursor-pointer border-t border-border hover:bg-accent/40", abierto && "bg-accent/30")} onClick={alternar}>
        <td className="px-2 py-1.5 text-muted-foreground">{abierto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
        <td className="px-2 py-1.5 font-mono font-semibold text-foreground">{g.codigo ?? "—"}</td>
        <td className="max-w-[420px] px-2 py-1.5">
          <span className="font-medium text-foreground">{[g.marca, g.modelo].filter(Boolean).join(" ")}</span>
          <span className="block truncate text-[11px] text-muted-foreground" title={g.descripcion}>{g.descripcion}</span>
        </td>
        <td className="px-2 py-1.5 text-muted-foreground">{g.proveedor ?? "—"}</td>
        <td className="px-2 py-1.5 text-right">
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums", g.disponibles > 0 ? "bg-emerald-100 text-emerald-800" : "bg-secondary text-muted-foreground")}>{g.disponibles}</span>
        </td>
        <td className="px-2 py-1.5 text-right">
          {g.reservadas > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-900">{g.reservadas}</span> : <span className="text-muted-foreground">0</span>}
        </td>
      </tr>
      {abierto && (
        <tr className="border-t border-border bg-muted/20">
          <td colSpan={6} className="px-3 py-2">
            <TablaPorSerie filas={g.maquinas} opciones={opciones} compacta />
          </td>
        </tr>
      )}
    </>
  );
}

const PAGINA = 100;

export function TablaPorSerie({ filas, opciones, compacta = false }: { filas: MaquinaTabla[]; opciones: OpcionesTabla; compacta?: boolean }) {
  const [mostrar, setMostrar] = useState(PAGINA);
  const visibles = compacta ? filas : filas.slice(0, mostrar);
  return (
    <div className={cn(!compacta && "overflow-x-auto rounded-lg border border-border")}>
      <table className="w-full text-xs">
        <thead className={cn("text-[11px] uppercase tracking-wide text-muted-foreground", !compacta && "bg-muted/60")}>
          <tr>
            <th className="px-2 py-1 text-right">N.º</th>
            {!compacta && <th className="px-2 py-1 text-left">Código</th>}
            {!compacta && <th className="px-2 py-1 text-left">Equipo</th>}
            <th className="px-2 py-1 text-left">Serie</th>
            <th className="px-2 py-1 text-left">Ubicación</th>
            {opciones.verIngreso && <th className="px-2 py-1 text-left">Ingreso</th>}
            <th className="px-2 py-1 text-left">Empresa</th>
            <th className="px-2 py-1 text-left">Estado</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((f, i) => (
            <FilaSerie key={f.id} f={f} n={i + 1} opciones={opciones} compacta={compacta} />
          ))}
        </tbody>
      </table>
      {!compacta && filas.length > mostrar && (
        <div className="border-t border-border p-2 text-center">
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setMostrar(mostrar + PAGINA)}>
            Mostrar {Math.min(PAGINA, filas.length - mostrar)} más ({filas.length - mostrar} restantes)
          </button>
        </div>
      )}
    </div>
  );
}

function FilaSerie({ f, n, opciones, compacta }: { f: MaquinaTabla; n: number; opciones: OpcionesTabla; compacta: boolean }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [problema, setProblema] = useState<string | null>(null);

  function cambiarEmpresa(v: string) {
    setProblema(null);
    empezar(async () => {
      const r = await ponerEmpresa([f.id], v === "OPEN" || v === "EFAMEINSA" ? v : null);
      if (r.error) return setProblema(r.error);
      router.refresh();
    });
  }
  function mover(nuevo: "disponible" | "baja") {
    if (nuevo === "baja" && !window.confirm(`¿Dar de baja la ${f.serie}? Deja de contar como stock.`)) return;
    setProblema(null);
    empezar(async () => {
      const r = await moverEquipo(f.id, nuevo, null);
      if (r.error) return setProblema(r.error);
      toast.success(nuevo === "disponible" ? `La ${f.serie} volvió a estar disponible.` : `La ${f.serie} quedó de baja.`);
      router.refresh();
    });
  }
  const est = ESTADO_MAQUINA[f.estado];
  const enlacePedido = f.servicioId ? `/almacen/pedidos/${f.servicioId}` : null;

  return (
    <tr className="border-t border-border align-top">
      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{n}</td>
      {!compacta && (
        <td className="px-2 py-1">
          <span className="font-mono font-semibold text-foreground">{f.codigo ?? "—"}</span>
          {f.item && <span className="block text-[10px] text-muted-foreground">{f.item}</span>}
        </td>
      )}
      {!compacta && (
        <td className="max-w-[300px] px-2 py-1">
          <span className="font-medium text-foreground">{[f.marca, f.modelo].filter(Boolean).join(" ")}</span>
          <span className="block truncate text-[11px] text-muted-foreground" title={f.descripcion}>{f.descripcion}</span>
        </td>
      )}
      <td className="px-2 py-1 font-mono">
        {f.serie}
        {compacta && f.item && <span className="block font-sans text-[10px] text-muted-foreground">{f.item}</span>}
      </td>
      <td className="px-2 py-1">{(f.ubicacion ?? "PLANTA").toUpperCase()}</td>
      {opciones.verIngreso && <td className="px-2 py-1 tabular-nums">{fechaCorta(f.ingreso)}</td>}
      <td className="px-2 py-1">
        {opciones.puedeEditar ? (
          <select
            value={f.empresa ?? ""}
            disabled={pendiente}
            onChange={(e) => cambiarEmpresa(e.target.value)}
            className={cn("h-7 rounded-md border border-border bg-background px-1 text-xs", !f.empresa && "text-muted-foreground")}
            title="De qué empresa es la máquina (Open o Efameinsa)"
          >
            <option value="">—</option>
            <option value="OPEN">OPEN</option>
            <option value="EFAMEINSA">EFAMEINSA</option>
          </select>
        ) : (
          <span>{f.empresa ?? "—"}</span>
        )}
      </td>
      <td className="px-2 py-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", est.clase)}>{est.texto}</span>
          {opciones.verCliente && (f.cliente || f.pedido) && (
            <span className="text-[11px] text-muted-foreground">
              {f.estado === "despachado" ? `salió el ${fechaCorta(f.salida)} · ` : "para "}
              {f.cliente ?? "cliente"}
              {enlacePedido ? (
                <>
                  {" · "}
                  <Link href={enlacePedido} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{f.pedido ?? "ver pedido"}</Link>
                </>
              ) : f.pedido ? ` · ${f.pedido}` : ""}
            </span>
          )}
          {opciones.puedeEditar && f.estado === "reservado" && !f.porPedido && (
            <button type="button" className="text-[11px] font-medium text-primary hover:underline" disabled={pendiente} onClick={() => mover("disponible")}>Liberar</button>
          )}
          {opciones.puedeEditar && f.estado === "reservado" && f.porPedido && (
            <span className="text-[10px] text-muted-foreground">(se libera quitando la serie en el pedido)</span>
          )}
          {opciones.puedeEditar && f.estado !== "despachado" && f.estado !== "baja" && (
            <button type="button" className="text-[11px] text-muted-foreground hover:text-destructive hover:underline" disabled={pendiente} onClick={() => mover("baja")}>Baja</button>
          )}
        </span>
        {problema && <span role="alert" className="mt-0.5 block max-w-xs text-[11px] leading-snug text-destructive">{problema}</span>}
      </td>
    </tr>
  );
}
