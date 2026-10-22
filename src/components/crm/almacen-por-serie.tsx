"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, Search } from "lucide-react";
import Link from "@/components/enlace";
import { moverEquipo, ponerEmpresa } from "@/lib/acciones/inventario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * EL ALMACÉN POR SERIE (Carlos, reunión 22-10-2026 10:29).
 *
 * «Este es el listado principal… la punta de partida»: una fila por máquina
 * física, numerada, con su código, su serie, dónde está, cuándo entró y de qué
 * empresa es (Open o Efameinsa). Y lo que Carlos quiso que sea automático: la
 * máquina que Central pidió para un pedido aparece RESERVADA con el cliente y
 * el pedido (lo hizo el CRM al registrar la serie), la que salió aparece
 * DESPACHADA con su fecha, y si el pedido cambia la máquina vuelve sola. Lesly
 * ya no corta y pega filas en su Excel.
 */

export interface FilaAlmacen {
  id: string;
  n?: number;
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
  /** Para quién está reservada o con quién salió, y el pedido. */
  cliente: string | null;
  pedido: string | null;
  servicioId: string | null;
  /** La reserva la hizo un pedido (se libera desde el pedido) o fue a mano (se libera aquí). */
  porPedido: boolean;
}

const ESTADO: Record<FilaAlmacen["estado"], { texto: string; clase: string }> = {
  disponible: { texto: "Disponible", clase: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  reservado: { texto: "Reservada", clase: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  despachado: { texto: "Despachada", clase: "bg-secondary text-muted-foreground" },
  baja: { texto: "De baja", clase: "bg-secondary text-muted-foreground" },
};

type Vista = "planta" | "disponible" | "reservado" | "despachado" | "todas";

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

export function AlmacenPorSerie({ filas }: { filas: FilaAlmacen[] }) {
  const [texto, setTexto] = useState("");
  const [vista, setVista] = useState<Vista>("planta");
  const [marca, setMarca] = useState("");

  const marcas = useMemo(() => [...new Set(filas.map((f) => (f.marca ?? "").toUpperCase()).filter(Boolean))].sort(), [filas]);
  const cuenta = useMemo(() => {
    const c = { disponible: 0, reservado: 0, despachado: 0 };
    for (const f of filas) if (f.estado in c) c[f.estado as keyof typeof c]++;
    return c;
  }, [filas]);

  const lista = useMemo(() => {
    const tokens = texto.toUpperCase().split(/\s+/).filter(Boolean);
    return filas
      .filter((f) => {
        if (vista === "planta") return f.estado === "disponible" || f.estado === "reservado";
        if (vista === "todas") return true;
        return f.estado === vista;
      })
      .filter((f) => !marca || (f.marca ?? "").toUpperCase() === marca)
      .filter((f) => {
        if (tokens.length === 0) return true;
        const pajar = `${f.codigo ?? ""} ${f.marca ?? ""} ${f.modelo} ${f.descripcion} ${f.serie} ${f.item ?? ""} ${f.cliente ?? ""} ${f.pedido ?? ""} ${f.empresa ?? ""}`.toUpperCase();
        return tokens.every((t) => pajar.includes(t));
      });
  }, [filas, texto, vista, marca]);

  const chips: { clave: Vista; texto: string }[] = [
    { clave: "planta", texto: `En planta (${cuenta.disponible + cuenta.reservado})` },
    { clave: "disponible", texto: `Disponibles (${cuenta.disponible})` },
    { clave: "reservado", texto: `Reservadas (${cuenta.reservado})` },
    { clave: "despachado", texto: `Despachadas (${cuenta.despachado})` },
    { clave: "todas", texto: "Todas" },
  ];

  if (filas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Boxes className="size-4" /> El almacén todavía no tiene máquinas.
        </p>
        <p className="mt-1 max-w-prose">
          Se llena desde la pestaña «Subir el Excel de stock»: suba el Excel de Importaciones, revise y pulse «Subir al almacén». Desde ahí cada máquina
          aparece aquí con su serie, y el catálogo y el cotizador cuentan el stock por serie.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="max-w-prose text-xs text-muted-foreground">
        Una fila por máquina. Cuando el almacén registra la serie en un pedido, la máquina queda <strong>reservada</strong> para ese cliente; al registrar la
        salida, queda <strong>despachada</strong>; si se quita o se corrige la serie en el pedido, vuelve a estar disponible. No hace falta tocar nada aquí.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, modelo, serie, cliente, pedido…" className="pl-8" />
        </div>
        <select value={marca} onChange={(e) => setMarca(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          <option value="">Todas las marcas</option>
          {marcas.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.clave}
            type="button"
            onClick={() => setVista(c.clave)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
              vista === c.clave ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {c.texto}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground">{lista.length} {lista.length === 1 ? "máquina" : "máquinas"}</span>
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguna máquina coincide con ese filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-right">N.º</th>
                <th className="px-2 py-1.5 text-left">Código</th>
                <th className="px-2 py-1.5 text-left">Equipo</th>
                <th className="px-2 py-1.5 text-left">Serie</th>
                <th className="px-2 py-1.5 text-left">Ubicación</th>
                <th className="px-2 py-1.5 text-left">Ingreso</th>
                <th className="px-2 py-1.5 text-left">Empresa</th>
                <th className="px-2 py-1.5 text-left">Estado</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {lista.map((f, i) => (
                <FilaMaquina key={f.id} f={f} n={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaMaquina({ f, n }: { f: FilaAlmacen; n: number }) {
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
  const est = ESTADO[f.estado];
  const enlacePedido = f.servicioId ? `/almacen/pedidos/${f.servicioId}` : null;

  return (
    <tr className="border-t border-border align-top">
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{n}</td>
      <td className="px-2 py-1.5">
        <span className="font-mono font-semibold text-foreground">{f.codigo ?? "—"}</span>
        {f.item && <span className="block text-[10px] text-muted-foreground">{f.item}</span>}
      </td>
      <td className="max-w-[320px] px-2 py-1.5">
        <span className="font-medium text-foreground">{[f.marca, f.modelo].filter(Boolean).join(" ")}</span>
        <span className="block truncate text-[11px] text-muted-foreground" title={f.descripcion}>{f.descripcion}</span>
      </td>
      <td className="px-2 py-1.5 font-mono">{f.serie}</td>
      <td className="px-2 py-1.5">{(f.ubicacion ?? "PLANTA").toUpperCase()}</td>
      <td className="px-2 py-1.5 tabular-nums">{fecha(f.ingreso)}</td>
      <td className="px-2 py-1.5">
        <select
          value={f.empresa ?? ""}
          disabled={pendiente}
          onChange={(e) => cambiarEmpresa(e.target.value)}
          className={cn("h-7 rounded-md border border-border bg-background px-1.5 text-xs", !f.empresa && "text-muted-foreground")}
          title="De qué empresa es la máquina"
        >
          <option value="">— sin poner —</option>
          <option value="OPEN">OPEN</option>
          <option value="EFAMEINSA">EFAMEINSA</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", est.clase)}>{est.texto}</span>
        {(f.cliente || f.pedido) && (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {f.estado === "despachado" ? `salió el ${fecha(f.salida)} · ` : "para "}
            {f.cliente ?? "cliente"}
            {enlacePedido ? (
              <>
                {" · "}
                <Link href={enlacePedido} className="text-primary hover:underline">{f.pedido ?? "ver pedido"}</Link>
              </>
            ) : f.pedido ? ` · ${f.pedido}` : ""}
          </span>
        )}
        {problema && <span role="alert" className="mt-0.5 block max-w-xs text-[11px] leading-snug text-destructive">{problema}</span>}
      </td>
      <td className="px-2 py-1.5 text-right">
        {f.estado === "reservado" && !f.porPedido && (
          <Button variant="ghost" size="sm" className="h-7" disabled={pendiente} onClick={() => mover("disponible")}>Liberar</Button>
        )}
        {f.estado === "reservado" && f.porPedido && (
          <span className="block max-w-[150px] text-[10px] leading-snug text-muted-foreground">Se libera quitando la serie en el pedido.</span>
        )}
        {f.estado !== "despachado" && f.estado !== "baja" && (
          <Button variant="ghost" size="sm" className="h-7 text-muted-foreground hover:text-destructive" disabled={pendiente} onClick={() => mover("baja")}>Baja</Button>
        )}
      </td>
    </tr>
  );
}
