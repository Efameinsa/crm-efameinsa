"use client";

// Las series del pedido (0253). Gary Group salió el 15-09 con guía y ninguna
// serie llegó al parque; el caso que abrió después «no tenía ninguna máquina».
// Acá, apenas el pedido sale (o antes, si la placa ya se leyó en la prueba),
// se escriben las series y cada una nace como máquina del cliente con la
// fecha de la guía como inicio de garantía. Lo ve postventa y el almacén.

import { useState, useTransition } from "react";
import Link from "@/components/enlace";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, ScanBarcode, X } from "lucide-react";
import { registrarSeriesDelPedido } from "@/lib/acciones/postventa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SeriesDelPedido({
  servicioId,
  equipos,
  vendidos,
  despachado,
  enlaceEquipo = "/postventa/equipos",
}: {
  servicioId: string;
  /** Las máquinas que ya nacieron de este pedido. */
  equipos: { id: string; serie: string | null; modelo_texto: string | null }[];
  /** Cuántos equipos vendió el cierre (suma de cantidades del bloque venta), si se sabe. */
  vendidos: number | null;
  despachado: boolean;
  enlaceEquipo?: string;
}) {
  const router = useRouter();
  const [series, setSeries] = useState<string[]>([""]);
  const [pendiente, startTransition] = useTransition();
  const faltan = vendidos != null ? Math.max(0, vendidos - equipos.length) : null;

  function guardar() {
    startTransition(async () => {
      const r = await registrarSeriesDelPedido(servicioId, series);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.fichadas ?? 0} máquina(s) registradas en el parque`);
      setSeries([""]);
      router.refresh();
    });
  }

  return (
    <div className={cn("rounded-lg border p-3", despachado && (faltan == null ? equipos.length === 0 : faltan > 0) ? "border-amber-400/60 bg-amber-500/5" : "border-border")}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <ScanBarcode className="size-4" /> Series de las máquinas de este pedido
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {vendidos != null ? `El cierre vendió ${vendidos} equipo${vendidos === 1 ? "" : "s"}. ` : ""}
        {equipos.length === 0
          ? despachado
            ? "El pedido ya salió y ninguna máquina está en el parque: sin serie, postventa no puede atender un caso de este cliente."
            : "Todavía sin series: se toman de la placa en la prueba o de la guía al salir."
          : `${equipos.length} en el parque${faltan ? `, faltan ${faltan}` : ""}.`}
      </p>
      {equipos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {equipos.map((e) => (
            <li key={e.id}>
              <Link href={`${enlaceEquipo}/${e.id}`} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] hover:bg-accent" title={e.modelo_texto ?? ""}>
                {e.serie ?? "sin serie"}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(faltan == null || faltan > 0) && (
        <div className="mt-2 space-y-1.5">
          {series.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input value={s} onChange={(e) => setSeries((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Serie como se lee en la placa" className="h-8 font-mono text-sm uppercase" />
              {series.length > 1 && (
                <button type="button" onClick={() => setSeries((xs) => xs.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" aria-label="Quitar">
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setSeries((xs) => [...xs, ""])} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <Plus className="size-3.5" /> Otra serie
            </button>
            <Button size="sm" onClick={guardar} disabled={pendiente || !series.some((s) => s.trim())}>
              {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : null} Registrar en el parque
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
