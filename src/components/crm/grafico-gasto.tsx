"use client";

import { motion, useReducedMotion } from "motion/react";
import type { PuntoSerie } from "@/lib/marketing";

export function GraficoGasto({ serie, moneda }: { serie: PuntoSerie[]; moneda: string }) {
  const reducido = useReducedMotion();

  if (serie.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos de gasto en este período todavía.</p>;
  }

  const maximo = Math.max(...serie.map((p) => p.gasto), 1);

  return (
    <div className="overflow-x-auto">
      <div className="flex h-48 min-w-max items-end gap-1.5 pb-1">
        {serie.map((p, i) => {
          const alturaPct = Math.max((p.gasto / maximo) * 100, p.gasto > 0 ? 3 : 0);
          return (
            <div
              key={p.fecha}
              className="flex w-8 flex-none flex-col items-center gap-1"
              title={`${p.etiqueta}: ${moneda} ${p.gasto.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`}
            >
              <div className="flex h-40 w-full items-end rounded-sm bg-secondary">
                <motion.div
                  className="w-full rounded-sm bg-primary"
                  initial={reducido ? false : { height: 0 }}
                  animate={{ height: `${alturaPct}%` }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: reducido ? 0 : Math.min(i * 0.01, 0.3) }}
                />
              </div>
              <span className="whitespace-nowrap text-[10px] text-muted-foreground">{p.etiqueta}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
