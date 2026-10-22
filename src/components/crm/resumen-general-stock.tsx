import { FileDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EL «RESUMEN GENERAL DE STOCK» QUE ENTREGABA IMPORTACIONES (reunión Santos–Lesly, 22-10-2026).
 *
 * Importaciones imprimía todos los lunes un informe para las comerciales:
 * industriales por proveedor (Alliance, GMP, Sailstar…) y tipo, con totales; y
 * LG consolidado por modelo. Desde ahora lo arma el CRM con lo que hay en el
 * almacén, en dos documentos, y Lesly solo sube su Excel cada semana. Sin costos.
 */
export function ResumenGeneralStock({
  enAlmacen,
  cargaEnRevision,
  compacto,
}: {
  enAlmacen: number;
  cargaEnRevision?: { id: string; archivo: string } | null;
  compacto?: boolean;
}) {
  const boton = (href: string, texto: string) => (
    <a
      key={href}
      href={href}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
    >
      <FileDown className="size-4" /> {texto}
    </a>
  );
  return (
    <div className={cn("rounded-xl border border-border p-4", compacto ? "space-y-2" : "space-y-3")}>
      <div>
        <p className="text-sm font-medium text-foreground">Resumen general de stock</p>
        <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
          El informe que Importaciones entregaba cada lunes, armado por el CRM con lo que hay en el almacén: equipos
          industriales por proveedor y tipo con sus totales, y equipos LG consolidados por modelo. Sin costos.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {boton("/api/operaciones/stock/general?doc=industriales", "Industriales (PDF)")}
        {boton("/api/operaciones/stock/general?doc=lg", "LG (PDF)")}
        <span className="text-xs text-muted-foreground">
          {enAlmacen === 0 ? "El almacén todavía no tiene máquinas: el PDF sale vacío." : `${enAlmacen} ${enAlmacen === 1 ? "máquina" : "máquinas"} en el almacén.`}
        </span>
      </div>
      {cargaEnRevision && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-2.5 dark:border-amber-800 dark:bg-amber-950/20">
          <span className="text-xs text-amber-900 dark:text-amber-200">
            Vista previa con lo que va a subir de «{cargaEnRevision.archivo}» (todavía no está en el almacén):
          </span>
          {boton(`/api/operaciones/stock/general?doc=industriales&carga=${cargaEnRevision.id}`, "Industriales")}
          {boton(`/api/operaciones/stock/general?doc=lg&carga=${cargaEnRevision.id}`, "LG")}
        </div>
      )}
    </div>
  );
}
