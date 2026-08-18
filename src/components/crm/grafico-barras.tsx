"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface BarraDato {
  clave: string;
  etiqueta: string;
  valor: number;
  valorTexto?: string; // etiqueta sobre la barra, ya formateada (los Server Components no pueden pasar funciones)
  detalle?: string; // tooltip
  apagada?: boolean; // tramo sin datos comparables, se pinta gris
}

// Gráfico de barras genérico (ventas por mes, gasto por día…). Mismo lenguaje
// visual que grafico-gasto.tsx; sin librería de charts a propósito: es una
// serie corta y el control fino del color/estado importa más que ejes ricos.
export function GraficoBarras({
  datos,
  resaltarUltima,
  vacio = "Sin datos en este período.",
}: {
  datos: BarraDato[];
  resaltarUltima?: boolean;
  vacio?: string;
}) {
  const reducido = useReducedMotion();
  if (datos.length === 0 || datos.every((d) => d.valor === 0)) {
    return <p className="text-sm text-muted-foreground">{vacio}</p>;
  }
  const maximo = Math.max(...datos.map((d) => d.valor), 1);

  return (
    <div className="overflow-x-auto">
      <div className="flex h-52 min-w-max items-end gap-2 pb-1">
        {datos.map((d, i) => {
          const altura = Math.max((d.valor / maximo) * 100, d.valor > 0 ? 3 : 0);
          const ultima = resaltarUltima && i === datos.length - 1;
          return (
            <div key={d.clave} className="flex w-12 flex-none flex-col items-center gap-1" title={d.detalle ?? `${d.etiqueta}: ${d.valorTexto ?? d.valor}`}>
              <span className="h-4 text-[10px] tabular-nums text-muted-foreground">{d.valor > 0 ? (d.valorTexto ?? String(Math.round(d.valor))) : ""}</span>
              <div className="flex h-36 w-full items-end rounded-sm bg-secondary">
                <motion.div
                  className={cn(
                    "w-full rounded-sm",
                    d.apagada ? "bg-muted-foreground/25" : ultima ? "bg-primary" : "bg-primary/70",
                  )}
                  initial={reducido ? false : { height: 0 }}
                  animate={{ height: `${altura}%` }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: reducido ? 0 : Math.min(i * 0.03, 0.4) }}
                />
              </div>
              <span className={cn("whitespace-nowrap text-[10px]", ultima ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {d.etiqueta}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
