import { usd } from "@/lib/reportes";
import { cn } from "@/lib/utils";
import type { ResultadoPeriodo } from "@/lib/finanzas";

// Estado de resultados simple con ANÁLISIS VERTICAL: cada línea se expresa
// también como % de las ventas, que es como se lee un estado de resultados —
// permite comparar meses de tamaños distintos sin hacer la cuenta a mano.
//
// Es una estimación, no contabilidad: el CRM no conoce el costo de compra de
// cada equipo. El costo sale de aplicar el margen que declaró gerencia, y por
// eso cada línea derivada lo dice.
export function EstadoResultados({ r, margenPct }: { r: ResultadoPeriodo; margenPct: number }) {
  const pct = (v: number) => (r.ventas_usd > 0 ? (v / r.ventas_usd) * 100 : 0);

  const lineas = [
    { etiqueta: "Ventas del período", valor: r.ventas_usd, tono: "base" as const, nota: `${r.n_ventas} venta${r.n_ventas === 1 ? "" : "s"} · ticket ${usd(r.ticket_promedio_usd)}` },
    { etiqueta: `− Costo de ventas (${Math.round(100 - margenPct)}%)`, valor: -r.costo_ventas_usd, tono: "resta" as const, nota: "estimado: ventas × (1 − margen)" },
    { etiqueta: "= Utilidad bruta estimada", valor: r.utilidad_bruta_usd, tono: "sub" as const, nota: `margen declarado ${margenPct}%` },
    { etiqueta: "− Inversión publicitaria", valor: -r.inversion_publicitaria_usd, tono: "resta" as const, nota: "Google y Meta, convertido a US$" },
    { etiqueta: "= Utilidad después de marketing", valor: r.utilidad_despues_mkt_usd, tono: "total" as const, nota: null },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 font-medium">Concepto</th>
            <th className="pb-2 pl-2 text-right font-medium">Monto</th>
            <th className="pb-2 pl-2 text-right font-medium" title="Análisis vertical: cada línea como porcentaje de las ventas del período">
              % de ventas
            </th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => (
            <tr
              key={l.etiqueta}
              className={cn(
                "border-b border-border last:border-0",
                l.tono === "total" && "bg-primary/5",
                l.tono === "sub" && "bg-secondary/40",
              )}
            >
              <td className={cn("py-2.5", l.tono === "total" || l.tono === "sub" ? "font-bold text-foreground" : "text-foreground")}>
                {l.etiqueta}
                {l.nota && <span className="block text-[10px] font-normal text-muted-foreground">{l.nota}</span>}
              </td>
              <td
                className={cn(
                  "py-2.5 pl-2 text-right tabular-nums",
                  l.tono === "total" ? "text-base font-extrabold" : l.tono === "sub" ? "font-bold" : "",
                  l.valor < 0 ? "text-muted-foreground" : l.tono === "total" ? (l.valor >= 0 ? "text-[#1E7F4F]" : "text-destructive") : "text-foreground",
                )}
              >
                {l.valor < 0 ? `(${usd(Math.abs(l.valor))})` : usd(l.valor)}
              </td>
              <td className="py-2.5 pl-2 text-right tabular-nums text-muted-foreground">
                {Math.abs(pct(l.valor)).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
