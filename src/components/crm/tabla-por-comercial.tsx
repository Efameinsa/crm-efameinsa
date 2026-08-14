"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface FilaComercial {
  id: string;
  nombre: string;
  abiertas: number;
  cotizado: number;
  vendido: number;
  pctMeta: number | null;
}

export function TablaPorComercial({ filas }: { filas: FilaComercial[] }) {
  const router = useRouter();

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
          <th className="pb-2 font-medium">Comercial</th>
          <th className="pb-2 pl-2 text-right font-medium">Abiertas</th>
          <th className="pb-2 pl-2 text-right font-medium">Cotizado</th>
          <th className="pb-2 pl-2 text-right font-medium">Vendido</th>
          <th className="pb-2 pl-2 font-medium">% meta</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((c) => (
          <tr
            key={c.id}
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/gerencia/comerciales/${c.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter") router.push(`/gerencia/comerciales/${c.id}`);
            }}
            className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <td className="py-2 text-foreground">{c.nombre}</td>
            <td className="py-2 pl-2 text-right tabular-nums">{c.abiertas}</td>
            <td className="py-2 pl-2 text-right tabular-nums">{c.cotizado.toLocaleString("es-PE")}</td>
            <td className="py-2 pl-2 text-right tabular-nums">{c.vendido.toLocaleString("es-PE")}</td>
            <td className="py-2 pl-2">
              {c.pctMeta === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-14 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn("h-full rounded-full", c.pctMeta >= 100 ? "bg-[#1E7F4F]" : "bg-primary")}
                      style={{ width: `${Math.min(c.pctMeta, 100)}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-foreground">{c.pctMeta}%</span>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
