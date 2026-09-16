import { Check, X } from "lucide-react";
import type { DecisionGerencia } from "@/lib/datos-cotizador";
import { cn } from "@/lib/utils";

/**
 * El histórico de lo que gerencia decidió sobre las cotizaciones de una
 * oportunidad (0237).
 *
 * Lo ve el comercial en la cotización rechazada y lo ve Carlos en la cola de
 * aprobaciones, para no volver a preguntar lo mismo: «según CRM detalla muy
 * bien el requerimiento del cliente, sin embargo no detalla tiempo de
 * ejecución de compra, precios, unidades…» es una observación que tiene que
 * estar a la vista cuando llega la segunda versión.
 */
export function HistorialDecisionesGerencia({
  decisiones,
  titulo = "Decisiones anteriores de gerencia",
  compacto = false,
}: {
  decisiones: DecisionGerencia[];
  titulo?: string;
  compacto?: boolean;
}) {
  if (decisiones.length === 0) return null;
  const dinero = (n: number | null) =>
    n == null ? null : `USD ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className={cn("rounded-lg border border-border", compacto && "text-xs")}>
      <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <ul className="divide-y divide-border">
        {decisiones.map((d) => {
          const rechazo = d.resultado === "rechazada_gerencia";
          return (
            <li key={d.id} className="px-3 py-2">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
                    rechazo ? "bg-destructive/10 text-destructive" : "bg-[#1E7F4F]/10 text-[#1E7F4F]",
                  )}
                >
                  {rechazo ? <X className="size-3" /> : <Check className="size-3" />}
                  {rechazo ? "Rechazada" : "Aprobada"}
                </span>
                {d.codigo && <span className="font-medium text-foreground">{d.codigo}</span>}
                <span className="text-muted-foreground">
                  {new Date(d.decididoAt).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}
                  {d.decididoPor ? ` · ${d.decididoPor}` : ""}
                </span>
              </p>
              {d.rechazados.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.rechazados
                    .map((r) => `${r.descripcion ?? "equipo"}${r.precio != null ? ` a ${dinero(r.precio)}` : ""}${r.lista != null ? ` (lista ${dinero(r.lista)})` : ""}`)
                    .join(" · ")}
                </p>
              )}
              {d.nota && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">&ldquo;{d.nota}&rdquo;</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
