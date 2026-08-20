import { usd } from "@/lib/reportes";
import { variacion, type MesFinanzas } from "@/lib/finanzas";
import { cn } from "@/lib/utils";

// Evolución mes a mes con ANÁLISIS HORIZONTAL: junto a cada mes, cuánto varió
// respecto al mes anterior. Es la lectura que permite decidir sobre marketing
// —si subir la inversión movió la aguja o no— sin sacar la calculadora.
export function TablaMesesFinanzas({ meses }: { meses: MesFinanzas[] }) {
  if (meses.length === 0) return <p className="text-sm text-muted-foreground">Sin meses en el período.</p>;

  const etiqueta = (mes: string) =>
    new Date(`${mes}-01T12:00:00`).toLocaleDateString("es-PE", { month: "short", year: "2-digit" });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 font-medium">Mes</th>
            <th className="pb-2 pl-2 text-right font-medium">Ventas</th>
            <th className="pb-2 pl-2 text-right font-medium" title="Variación de las ventas respecto al mes anterior">
              Var.
            </th>
            <th className="pb-2 pl-2 text-right font-medium">Utilidad bruta</th>
            <th className="pb-2 pl-2 text-right font-medium">Publicidad</th>
            <th className="pb-2 pl-2 text-right font-medium" title="Utilidad bruta estimada menos la inversión publicitaria">
              Después de mkt
            </th>
            <th className="pb-2 pl-2 text-right font-medium" title="Ventas ÷ inversión publicitaria del mes. Con margen bajo, un ROAS de 2× todavía deja pérdida.">
              ROAS
            </th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m, i) => {
            const v = variacion(m.ventas_usd, meses[i - 1]?.ventas_usd);
            const roas = m.gasto_ads_usd > 0 ? m.ventas_usd / m.gasto_ads_usd : null;
            return (
              <tr key={m.mes} className="border-b border-border last:border-0 hover:bg-accent">
                <td className="py-2 capitalize text-foreground">{etiqueta(m.mes)}</td>
                <td className="py-2 pl-2 text-right font-semibold tabular-nums text-foreground">{usd(m.ventas_usd)}</td>
                <td className="py-2 pl-2 text-right tabular-nums">
                  {v === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={cn("font-medium", v >= 0 ? "text-[#1E7F4F]" : "text-destructive")}>
                      {v >= 0 ? "+" : ""}
                      {v.toFixed(0)}%
                    </span>
                  )}
                </td>
                <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">{usd(m.utilidad_bruta_usd)}</td>
                <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">{usd(m.gasto_ads_usd)}</td>
                <td
                  className={cn(
                    "py-2 pl-2 text-right font-semibold tabular-nums",
                    m.utilidad_despues_mkt_usd >= 0 ? "text-foreground" : "text-destructive",
                  )}
                >
                  {usd(m.utilidad_despues_mkt_usd)}
                </td>
                <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">
                  {roas === null ? "—" : `${roas.toFixed(1)}×`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
