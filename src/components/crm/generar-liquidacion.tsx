import Link from "@/components/enlace";
import { FileCog } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * EL BOTÓN «GENERAR LIQUIDACIÓN» (0534; reunión 17-10, gerencia con Jhon).
 * Abre la pantalla donde el CRM arma la liquidación con el pedido, los
 * abonos y las facturas, Finanzas ajusta lo que quiera y la valida. Está en
 * cada fila de «Por liquidar» y dentro del pedido: Jhon no lo encontró el
 * 17-10 cuando solo estaba en el detalle.
 */
export function GenerarLiquidacion({ servicioId, principal = true, etiqueta }: { servicioId: string; principal?: boolean; etiqueta?: string }) {
  return (
    <Button size="sm" variant={principal ? "default" : "outline"} render={<Link href={`/finanzas/pedidos/${servicioId}/liquidacion`} />}>
      <FileCog className="size-3.5" />
      {etiqueta ?? "Generar liquidación"}
    </Button>
  );
}
