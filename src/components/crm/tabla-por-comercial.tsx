"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { FilaComercialResumen } from "@/lib/reportes";

// Tabla de rendimiento por comercial del panel de gerencia. La fila entera
// lleva al detalle del comercial conservando el período elegido.
export function TablaPorComercial({ filas }: { filas: FilaComercialResumen[] }) {
  const router = useRouter();
  const sp = useSearchParams();

  function ir(id: string) {
    const params = new URLSearchParams();
    for (const k of ["desde", "hasta", "historico"]) {
      const v = sp.get(k);
      if (v) params.set(k, v);
    }
    const q = params.toString();
    router.push(`/gerencia/comerciales/${id}${q ? `?${q}` : ""}`);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 font-medium">Comercial</th>
            <th className="pb-2 pl-2 text-right font-medium">Vendido</th>
            <th className="pb-2 pl-2 text-right font-medium" title="Ventas cerradas en el período">
              Ventas
            </th>
            <th className="pb-2 pl-2 text-right font-medium" title="Clientes distintos que compraron">
              Clientes
            </th>
            <th className="pb-2 pl-2 text-right font-medium" title="Oportunidades abiertas hoy">
              Abiertas
            </th>
            <th className="pb-2 pl-2 text-right font-medium" title="Cotizaciones enviadas en el período">
              Cotiz.
            </th>
            <th className="pb-2 pl-2 font-medium" title="Vendido ÷ (meta mensual × meses del período)">
              % meta
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((c) => {
            const pctMeta = c.meta_periodo > 0 ? Math.round((c.ventas_usd / c.meta_periodo) * 100) : null;
            return (
              <tr
                key={c.id}
                role="link"
                tabIndex={0}
                onClick={() => ir(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") ir(c.id);
                }}
                className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <td className="py-2 text-foreground">
                  {c.nombre}
                  {c.codigo && <span className="ml-1 text-muted-foreground">({c.codigo})</span>}
                </td>
                <td className="py-2 pl-2 text-right font-semibold tabular-nums text-foreground">
                  {Math.round(c.ventas_usd).toLocaleString("es-PE")}
                </td>
                <td className="py-2 pl-2 text-right tabular-nums">{c.n_ventas}</td>
                <td className="py-2 pl-2 text-right tabular-nums">{c.clientes}</td>
                <td className="py-2 pl-2 text-right tabular-nums">{c.op_abiertas}</td>
                <td className="py-2 pl-2 text-right tabular-nums">{c.cot_enviadas}</td>
                <td className="py-2 pl-2">
                  {pctMeta === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn("h-full rounded-full", pctMeta >= 100 ? "bg-[#1E7F4F]" : "bg-primary")}
                          style={{ width: `${Math.min(pctMeta, 100)}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-foreground">{pctMeta}%</span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
