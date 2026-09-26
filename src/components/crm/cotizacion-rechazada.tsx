import Link from "@/components/enlace";
import { CircleAlert, FilePlus2 } from "lucide-react";
import type { DecisionGerencia, ItemRechazado } from "@/lib/datos-cotizador";
import { Button } from "@/components/ui/button";
import { HistorialDecisionesGerencia } from "@/components/crm/historial-decisiones-gerencia";

/**
 * La cotización que gerencia rechazó: queda como histórico, no se edita.
 *
 * Carlos, 15-09, con el caso de Brenda (17 kg: lista 3 950, cotizó 3 800,
 * pidió 3 650 y después 3 750; él rechazó dos veces y el cliente mandó la OC a
 * 3 800): «lo que yo quisiera es que se quede esa retroalimentación, porque
 * después agarra y lo actualiza… los rechazados ya no se pueden editar,
 * entonces de ahora en adelante que quede histórico, que haga otro».
 *
 * Por eso acá no hay campos: los precios que se pidieron, lo que gerencia
 * contestó —con quién y cuándo— y una sola puerta: hacer una cotización nueva.
 * Santos, 16-09: sin «duplicar para corregir»; se crea otra.
 */
export function CotizacionRechazada({
  codigo,
  serie,
  items,
  decisiones,
  nuevaHref,
  volverHref,
}: {
  codigo: string | null;
  serie: string;
  items: ItemRechazado[];
  decisiones: DecisionGerencia[];
  nuevaHref: string;
  volverHref: string;
}) {
  const dinero = (n: number) => `USD ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-8">
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
          <CircleAlert className="size-4" />
          Gerencia rechazó esta cotización{codigo ? ` (${codigo})` : ""} · serie {serie}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Queda como histórico con el motivo de gerencia: no se edita ni se vuelve a pedir. Para cotizar de nuevo,
          haga una cotización nueva con los precios corregidos.
        </p>
      </div>

      <div className="rounded-lg border border-border">
        <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Lo que se pidió aprobar
        </p>
        <ul className="divide-y divide-border">
          {items.map((i, n) => {
            const bajo = i.precioLista != null && i.precioUnitario < i.precioLista;
            return (
              <li key={n} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 text-foreground">
                  {i.cantidad > 1 && <span className="mr-1 tabular-nums text-muted-foreground">{i.cantidad} ×</span>}
                  {i.nombre}
                </span>
                <span className="tabular-nums">
                  <span className={bajo ? "font-semibold text-destructive" : "text-foreground"}>{dinero(i.precioUnitario)}</span>
                  {i.precioLista != null && (
                    <span className="ml-2 text-xs text-muted-foreground">lista {dinero(i.precioLista)}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <HistorialDecisionesGerencia decisiones={decisiones} titulo="Lo que contestó gerencia" />

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button render={<Link href={nuevaHref} />}>
          <FilePlus2 className="size-4" />
          Hacer una cotización nueva
        </Button>
        <Button variant="ghost" render={<Link href={volverHref} />}>
          Volver a la oportunidad
        </Button>
      </div>
    </div>
  );
}
