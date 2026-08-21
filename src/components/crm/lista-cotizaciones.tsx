"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, CircleCheckBig, Copy } from "lucide-react";
import { toast } from "sonner";
import { duplicarCotizacion, enviarCotizacion, registrarVenta } from "@/lib/acciones/cotizaciones";
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

  function onDuplicar(id: string) {
    startTransition(async () => {
      const r = await duplicarCotizacion(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success(`${r.codigoNuevo} creada como copia de ${r.codigoViejo}`);
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
          <div
            key={c.id}
            className={cn(
              "rounded-lg border p-3.5",
              puedeVender ? "border-[#1E7F4F]/40 bg-[#1E7F4F]/5" : "border-border bg-background",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs font-semibold text-foreground">{c.codigo}</span>
                <span className="text-xs text-muted-foreground">{c.serie}</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {c.moneda} {c.total.toLocaleString("es-PE")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* "Aprobada · Borrador" se leía como una contradicción. Son dos
                    ejes distintos: la aprobación de precio y el envío. Cuando
                    la cotización entra en lista se auto-aprueba y esa etiqueta
                    no dice nada, así que manda el estado de envío. El sello de
                    aprobación se muestra solo cuando SÍ informa: pendiente,
                    rechazada, o aprobada a mano por gerencia. */}
                {c.estado_aprobacion !== "auto_aprobada" && (
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", aprobacion.clases)}>
                    {aprobacion.etiqueta}
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                    c.estado === "borrador" ? "bg-secondary text-muted-foreground" : aprobacion.clases,
                  )}
                >
                  {ESTADO_ENVIO[c.estado] ?? c.estado}
                </span>
              </div>
            </div>

            {c.nota_gerencia && (
              <p className="mt-2 rounded-md bg-secondary px-2.5 py-1.5 text-xs text-muted-foreground">
                &ldquo;{c.nota_gerencia}&rdquo;
              </p>
            )}

            {puedeVender && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#1E7F4F]">
                <CircleCheckBig className="size-3.5" />
                Enviada y aprobada — ya se puede cerrar la venta.
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
                <Button
                  size="sm"
                  disabled={enviando}
                  onClick={() => onRegistrarVenta(c.id)}
                  className="bg-[#1E7F4F] hover:bg-[#1E7F4F]/90"
                >
                  <CircleCheckBig className="size-3.5" />
                  Registrar venta
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={enviando} onClick={() => onDuplicar(c.id)}>
                <Copy className="size-3.5" />
                Duplicar
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
