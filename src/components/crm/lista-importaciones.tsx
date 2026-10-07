"use client";

// La lista de «Por importar» (0402): pestañas por motivo, buscador y, en cada
// máquina, la fecha estimada de llegada con su nota.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { anotarImportacion, type PendienteImportacion } from "@/lib/acciones/importaciones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { valor: "importacion", etiqueta: "Por importar" },
  { valor: "sin_motivo", etiqueta: "Sin stock, sin motivo" },
  { valor: "otros", etiqueta: "Compra local o fabricación" },
  { valor: "todas", etiqueta: "Todas" },
] as const;

function dias(desde: string | null, hoy: string): number | null {
  if (!desde) return null;
  return Math.max(0, Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(desde)) / 86_400_000));
}

function Fila({ f, hoy }: { f: PendienteImportacion; hoy: string }) {
  const router = useRouter();
  const [eta, setEta] = useState(f.eta ?? "");
  const [nota, setNota] = useState(f.nota ?? "");
  const [guardando, iniciar] = useTransition();
  const cambio = eta !== (f.eta ?? "") || nota !== (f.nota ?? "");
  const atrasada = f.eta && f.eta < hoy;
  const espera = dias(f.pedido_desde, hoy);
  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2.5">
        <p className="text-sm font-medium text-foreground">{f.descripcion}</p>
        <p className="text-[11px] text-muted-foreground">{f.sku ?? "sin código"}</p>
      </td>
      <td className="px-3 py-2.5 text-sm text-foreground">{f.cliente}</td>
      <td className="px-3 py-2.5 text-sm tabular-nums text-muted-foreground">{espera === null ? "—" : `${espera} d`}</td>
      <td className="px-3 py-2.5">
        <Input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className={cn("h-8 w-40 text-xs", atrasada && "border-red-400 text-red-700")} />
        {atrasada && <p className="mt-0.5 text-[11px] font-medium text-red-700">Ya pasó la fecha</p>}
      </td>
      <td className="px-3 py-2.5">
        <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Ej.: embarque de LG, llega al Callao" className="h-8 text-xs" />
        {f.actualizada_at && <p className="mt-0.5 text-[11px] text-muted-foreground">Anotado el {fechaLima(f.actualizada_at)}</p>}
      </td>
      <td className="px-3 py-2.5 text-right">
        <Button
          size="sm"
          disabled={!cambio || guardando}
          onClick={() =>
            iniciar(async () => {
              const r = await anotarImportacion({ itemId: f.item_id, eta: eta || null, nota });
              if (r.error) toast.error(r.error);
              else {
                toast.success(r.n && r.n > 1 ? `Guardado en las ${r.n} unidades iguales del pedido` : "Guardado");
                router.refresh();
              }
            })
          }
        >
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
      </td>
    </tr>
  );
}

export function ListaImportaciones({ filas, hoy, verInicial, qInicial }: { filas: PendienteImportacion[]; hoy: string; verInicial: string; qInicial: string }) {
  const [ver, setVer] = useState(verInicial);
  const [q, setQ] = useState(qInicial);
  const cuenta = useMemo(
    () => ({
      importacion: filas.filter((f) => f.motivo === "importacion").length,
      sin_motivo: filas.filter((f) => !f.motivo).length,
      otros: filas.filter((f) => f.motivo === "compra_local" || f.motivo === "fabricacion").length,
      todas: filas.length,
    }),
    [filas],
  );
  const texto = q.trim().toLowerCase();
  const lista = filas.filter(
    (f) =>
      (ver === "todas" ||
        (ver === "importacion" && f.motivo === "importacion") ||
        (ver === "sin_motivo" && !f.motivo) ||
        (ver === "otros" && (f.motivo === "compra_local" || f.motivo === "fabricacion"))) &&
      (!texto || `${f.cliente} ${f.descripcion} ${f.sku ?? ""}`.toLowerCase().includes(texto)),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {PESTANAS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => setVer(p.valor)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              ver === p.valor ? "border-[#8B1510] bg-[#8B1510] text-white" : "border-border text-muted-foreground hover:border-[#8B1510]/50",
            )}
          >
            {p.etiqueta} <span className="tabular-nums opacity-80">{cuenta[p.valor]}</span>
          </button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente o equipo" className="ml-auto h-8 w-60 text-xs" />
      </div>
      {ver === "sin_motivo" && (
        <p className="text-xs text-muted-foreground">
          Estas máquinas no tienen serie y nadie dijo por qué. Si hay que importarlas, anote la fecha estimada: quedan
          marcadas «por importar» solas.
        </p>
      )}
      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          <CalendarClock className="size-6" />
          {ver === "importacion" ? "No hay máquinas marcadas por importar. Revise «Sin stock, sin motivo»." : "No hay máquinas en esta lista."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-left">
            <thead className="bg-secondary/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Máquina</th>
                <th className="px-3 py-2 font-semibold">Cliente</th>
                <th className="px-3 py-2 font-semibold">Espera</th>
                <th className="px-3 py-2 font-semibold">Llega (estimado)</th>
                <th className="px-3 py-2 font-semibold">Nota</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => (
                <Fila key={f.item_id} f={f} hoy={hoy} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
