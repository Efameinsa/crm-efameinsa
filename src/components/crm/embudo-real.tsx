"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowDown } from "lucide-react";
import type { EmbudoTotales } from "@/lib/marketing";
import { cn } from "@/lib/utils";

interface Etapa {
  etiqueta: string;
  ayuda: string;
  total: number;
  destacada?: boolean;
}

function formatoMoneda(moneda: string, valor: number): string {
  return `${moneda} ${valor.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
}

export function EmbudoReal({ totales, soloTramoMedible }: { totales: EmbudoTotales; soloTramoMedible?: boolean }) {
  const reducido = useReducedMotion();

  const etapas: Etapa[] = [
    { etiqueta: "Leads en el CRM", ayuda: "contactos que realmente ingresaron", total: totales.leadsCrm },
    { etiqueta: "Oportunidades", ayuda: "asignados a un comercial", total: totales.oportunidades },
    { etiqueta: "Ventas cerradas", ayuda: "terminaron en compra", total: totales.ventas, destacada: true },
  ];
  const maximo = Math.max(1, ...etapas.map((e) => e.total));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        {etapas.map((e, i) => {
          const anterior = i > 0 ? etapas[i - 1].total : null;
          const conversion = anterior && anterior > 0 ? Math.round((e.total / anterior) * 100) : null;
          const ancho = Math.max((e.total / maximo) * 100, e.total > 0 ? 5 : 0);

          return (
            <div key={e.etiqueta}>
              {conversion !== null && (
                <p className="flex items-center gap-1 py-1 pl-[152px] text-[11px] text-muted-foreground">
                  <ArrowDown className="size-3" />
                  <b className="text-foreground">{conversion}%</b> avanza
                </p>
              )}
              <div className="grid grid-cols-[140px_1fr_auto] items-center gap-3">
                <div className="text-right">
                  <p className="text-xs font-medium text-foreground">{e.etiqueta}</p>
                  <p className="text-[10px] leading-tight text-muted-foreground">{e.ayuda}</p>
                </div>
                <div className="h-7 overflow-hidden rounded-md bg-secondary">
                  <motion.div
                    className={cn(
                      "flex h-full items-center justify-end rounded-md px-2 text-xs font-semibold tabular-nums text-white",
                      e.destacada ? "bg-[#1E7F4F]" : "bg-primary",
                    )}
                    initial={reducido ? false : { width: 0 }}
                    animate={{ width: `${ancho}%` }}
                    transition={{ duration: 0.5, ease: "easeOut", delay: reducido ? 0 : i * 0.12 }}
                  >
                    {e.total > 0 ? e.total : ""}
                  </motion.div>
                </div>
                <span className="w-10 text-right text-sm font-semibold tabular-nums text-foreground">{e.total}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
        <Metrica
          etiqueta="Inversión"
          valor={formatoMoneda(totales.moneda, totales.gasto)}
          ayuda={soloTramoMedible ? "gasto del tramo con leads" : "gasto en el período"}
        />
        <Metrica
          etiqueta="Costo por lead (CPL)"
          valor={totales.cplReal !== null ? formatoMoneda(totales.moneda, totales.cplReal) : "—"}
          ayuda={totales.cplReal !== null ? "inversión ÷ leads del CRM" : "sin leads en el período"}
          destacada
        />
        <Metrica
          etiqueta="Costo por venta (CPA)"
          valor={totales.costoPorVenta !== null ? formatoMoneda(totales.moneda, totales.costoPorVenta) : "—"}
          ayuda={totales.costoPorVenta !== null ? "inversión ÷ ventas atribuidas" : "sin ventas atribuidas todavía"}
        />
        <Metrica
          etiqueta="Retorno (ROAS)"
          valor={totales.roas !== null ? `${totales.roas.toFixed(2)}×` : "—"}
          ayuda={
            totales.roas !== null
              ? `${formatoMoneda(totales.moneda, totales.montoVentas)} vendidos`
              : "sin ventas atribuidas"
          }
          exito={totales.roas !== null && totales.roas >= 1}
        />
      </div>
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  ayuda,
  destacada,
  exito,
}: {
  etiqueta: string;
  valor: string;
  ayuda: string;
  destacada?: boolean;
  exito?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        destacada ? "border-primary/30 bg-primary/5" : "border-border",
        exito && "border-[#1E7F4F]/30 bg-[#1E7F4F]/5",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums",
          exito ? "text-[#1E7F4F]" : destacada ? "text-primary" : "text-foreground",
        )}
      >
        {valor}
      </p>
      <p className="text-[10px] leading-tight text-muted-foreground">{ayuda}</p>
    </div>
  );
}
