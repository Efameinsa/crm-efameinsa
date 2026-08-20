"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { usd } from "@/lib/reportes";
import { cn } from "@/lib/utils";
import type { FinanzasMarketing } from "@/lib/finanzas";
import { FormaCltv } from "@/components/crm/forma-cltv";

type Cltv = FinanzasMarketing["cltv"];

// Dos bloques que responden preguntas distintas sobre el mismo dato, sin
// librerías: SVG a mano, como el resto de los gráficos del CRM.
//
//  · LA FORMA (`FormaCltv`): histograma con su curva de densidad y, debajo y
//    con el mismo eje, la caja y bigotes. Responde "¿cómo es un cliente
//    típico y cuán dispersos están?".
//  · PARETO: cuánta concentración hay. Barras por decil + acumulado, y al
//    hacer clic en una barra se despliega QUIÉNES son esos clientes — sin la
//    lista, el gráfico informa pero no deja actuar.

export function DistribucionCltv({ cltv }: { cltv: Cltv }) {
  const [abierto, setAbierto] = useState<number | null>(null);

  const total = cltv.total_usd || 1;
  const filas = cltv.deciles.map((d, i) => ({
    ...d,
    pctIngreso: (d.monto_usd / total) * 100,
    acumulado: (cltv.deciles.slice(0, i + 1).reduce((s, x) => s + x.monto_usd, 0) / total) * 100,
  }));
  const maximoBarra = Math.max(...cltv.deciles.map((d) => d.monto_usd), 1);

  return (
    <div className="space-y-6">
      {/* Orden deliberado: primero la FORMA (con su resumen de cinco números
          justo debajo y en el mismo eje) y después la CONCENTRACIÓN (Pareto).
          Son preguntas distintas y en ese orden se entienden encadenadas. */}
      <FormaCltv cltv={cltv} />

      {/* ---------- Pareto ---------- */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Concentración del ingreso (Pareto) — clic en una barra para ver quiénes son
        </p>
        <div className="space-y-1.5">
          {filas.map((d) => {
            const activo = abierto === d.decil;
            return (
              <div key={d.decil}>
                <button
                  type="button"
                  onClick={() => setAbierto(activo ? null : d.decil)}
                  className="grid w-full cursor-pointer grid-cols-[104px_1fr_auto] items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs transition-colors hover:bg-accent"
                  aria-expanded={activo}
                >
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <ChevronDown className={cn("size-3 transition-transform", activo && "rotate-180")} />
                    {d.decil * 10 - 10}–{d.decil * 10}%
                    <span className="text-[10px]">({d.clientes})</span>
                  </span>
                  <span className="h-4 overflow-hidden rounded-sm bg-secondary">
                    <span
                      className={cn("block h-full rounded-sm", d.decil === 1 ? "bg-primary" : "bg-primary/45")}
                      style={{ width: `${Math.max((d.monto_usd / maximoBarra) * 100, 1)}%` }}
                    />
                  </span>
                  <span className="w-32 text-right tabular-nums text-muted-foreground">
                    <b className="text-foreground">{d.pctIngreso.toFixed(1)}%</b> · acum. {d.acumulado.toFixed(0)}%
                  </span>
                </button>

                {activo && (
                  <div className="mb-1 ml-6 mt-1 rounded-lg border border-border bg-card p-2.5">
                    <p className="mb-1.5 text-[11px] text-muted-foreground">
                      {d.clientes} cliente{d.clientes === 1 ? "" : "s"} entre {usd(d.desde_usd)} y {usd(d.hasta_usd)} ·
                      aportan {usd(d.monto_usd)}
                      {d.muestra.length < d.clientes && ` · se listan los ${d.muestra.length} mayores`}
                    </p>
                    <ul className="divide-y divide-border">
                      {d.muestra.map((c) => (
                        <li key={c.cuenta_id} className="flex items-center justify-between gap-3 py-1 text-xs">
                          <Link href={`/gerencia/clientes/${c.cuenta_id}`} className="truncate text-foreground hover:underline">
                            {c.razon_social}
                          </Link>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            <b className="text-foreground">{usd(c.total_usd)}</b> · {c.compras} compra
                            {c.compras === 1 ? "" : "s"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Clientes ordenados de mayor a menor valor histórico, en grupos del 10 %. Sobre{" "}
          <b className="text-foreground">{cltv.clientes.toLocaleString("es-PE")}</b> clientes con al menos una compra;{" "}
          <b className="text-foreground">{cltv.con_2_o_mas}</b> compraron dos o más veces (
          {cltv.compras_promedio.toFixed(1)} compras por cliente en promedio). El CLTV se calcula sobre todo el
          historial disponible, no solo el período filtrado.
        </p>
      </div>
    </div>
  );
}
