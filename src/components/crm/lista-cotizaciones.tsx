"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { enviarCotizacion, registrarVenta } from "@/lib/acciones/cotizaciones";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CotizacionResumen {
  id: string;
  codigo: string | null;
  serie: string;
  estado: string;
  estado_aprobacion: string;
  total: number;
  moneda: string;
  nota_gerencia: string | null;
}

const ESTADO_APROBACION: Record<string, { etiqueta: string; clases: string }> = {
  auto_aprobada: { etiqueta: "Aprobada", clases: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  pendiente_gerencia: { etiqueta: "Pendiente de gerencia", clases: "bg-amber-500/10 text-amber-700" },
  aprobada_gerencia: { etiqueta: "Aprobada por gerencia", clases: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  rechazada_gerencia: { etiqueta: "Rechazada por gerencia", clases: "bg-destructive/10 text-destructive" },
};

const ESTADO_ENVIO: Record<string, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  perdida: "Perdida",
  vencida: "Vencida",
};

export function ListaCotizaciones({ cotizaciones }: { cotizaciones: CotizacionResumen[] }) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();

  function onEnviar(id: string) {
    startTransition(async () => {
      const r = await enviarCotizacion(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Cotización enviada");
        router.refresh();
      }
    });
  }

  function onRegistrarVenta(id: string) {
    if (!confirm("¿Confirmar la venta con esta cotización?")) return;
    startTransition(async () => {
      const r = await registrarVenta(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Venta registrada");
        router.refresh();
      }
    });
  }

  if (cotizaciones.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay cotizaciones.</p>;
  }

  return (
    <div className="space-y-2">
      {cotizaciones.map((c) => {
        const puedeEnviar = c.estado === "borrador" && (c.estado_aprobacion === "auto_aprobada" || c.estado_aprobacion === "aprobada_gerencia");
        const puedeVender = c.estado === "enviada" && (c.estado_aprobacion === "auto_aprobada" || c.estado_aprobacion === "aprobada_gerencia");
        const aprobacion = ESTADO_APROBACION[c.estado_aprobacion];

        return (
          <div key={c.id} className="rounded-lg border border-border bg-background p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs font-semibold text-foreground">{c.codigo}</span>
                <span className="text-xs text-muted-foreground">{c.serie}</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {c.moneda} {c.total.toLocaleString("es-PE")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", aprobacion.clases)}>
                  {aprobacion.etiqueta}
                </span>
                <span className="text-[11px] text-muted-foreground">{ESTADO_ENVIO[c.estado] ?? c.estado}</span>
              </div>
            </div>

            {c.nota_gerencia && (
              <p className="mt-2 rounded-md bg-secondary px-2.5 py-1.5 text-xs text-muted-foreground">
                &ldquo;{c.nota_gerencia}&rdquo;
              </p>
            )}

            <div className="mt-2.5 flex items-center gap-3">
              <a
                href={`/api/cotizaciones/${c.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <FileDown className="size-3.5" />
                Ver PDF
              </a>
              {puedeEnviar && (
                <Button size="sm" variant="outline" disabled={enviando} onClick={() => onEnviar(c.id)}>
                  Enviar
                </Button>
              )}
              {puedeVender && (
                <Button size="sm" disabled={enviando} onClick={() => onRegistrarVenta(c.id)}>
                  Registrar venta
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
