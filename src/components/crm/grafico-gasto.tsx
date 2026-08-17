"use client";

import { motion, useReducedMotion } from "motion/react";
import type { PuntoSerie } from "@/lib/marketing";
import { cn } from "@/lib/utils";

export function GraficoGasto({
  serie,
  moneda,
  desdeConLeads,
}: {
  serie: PuntoSerie[];
  moneda: string;
  // Fecha desde la que el CRM tiene leads. Lo anterior se pinta apagado:
  // hubo inversión, pero no se puede medir qué produjo.
  desdeConLeads?: string | null;
}) {
  const reducido = useReducedMotion();

  if (serie.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos de gasto en este período todavía.</p>;
  }

  const maximo = Math.max(...serie.map((p) => p.gasto), 1);
  const hayTramoSinLeads = desdeConLeads ? serie.some((p) => p.fecha < desdeConLeads) : false;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="flex h-48 min-w-max items-end gap-1.5 pb-1">
          {serie.map((p, i) => {
            const alturaPct = Math.max((p.gasto / maximo) * 100, p.gasto > 0 ? 3 : 0);
            const sinLeads = desdeConLeads ? p.fecha < desdeConLeads : false;
            return (
              <div
                key={p.fecha}
                className="flex w-8 flex-none flex-col items-center gap-1"
                title={`${p.etiqueta}: ${moneda} ${p.gasto.toLocaleString("es-PE", { maximumFractionDigits: 2 })}${
                  sinLeads ? " · sin datos de leads en este período" : ""
                }`}
              >
                <div className="flex h-40 w-full items-end rounded-sm bg-secondary">
                  <motion.div
                    className={cn(
                      "w-full rounded-sm",
                      sinLeads ? "bg-muted-foreground/25" : "bg-primary",
                    )}
                    initial={reducido ? false : { height: 0 }}
                    animate={{ height: `${alturaPct}%` }}
                    transition={{ duration: 0.4, ease: "easeOut", delay: reducido ? 0 : Math.min(i * 0.01, 0.3) }}
                  />
                </div>
                <span className={cn("whitespace-nowrap text-[10px]", sinLeads ? "text-muted-foreground/60" : "text-muted-foreground")}>
                  {p.etiqueta}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {hayTramoSinLeads && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-primary" />
            Con datos de leads — medible
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-muted-foreground/25" />
            Sin datos de leads — solo se conoce el gasto
          </span>
        </div>
      )}
    </div>
  );
}
