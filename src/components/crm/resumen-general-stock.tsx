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
  porEmpresa,
  cargaEnRevision,
  compacto,
}: {
  /** Máquinas disponibles de cada empresa: un resumen por empresa, con su logo (Santos 23-10). */
  porEmpresa: Record<"OPEN" | "EFAMEINSA", number>;
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
      {(["OPEN", "EFAMEINSA"] as const)
        .filter((e) => e === "OPEN" || porEmpresa[e] > 0)
        .map((e) => (
          <div key={e} className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-xs font-semibold text-foreground">{e === "OPEN" ? "Open" : "Efameinsa"}</span>
            {boton(`/api/operaciones/stock/general?doc=industriales&empresa=${e}`, "Industriales (PDF)")}
            {boton(`/api/operaciones/stock/general?doc=lg&empresa=${e}`, "LG (PDF)")}
            <span className="text-xs text-muted-foreground">
              {porEmpresa[e] === 0 ? "Todavía sin máquinas: el PDF sale vacío." : `${porEmpresa[e]} ${porEmpresa[e] === 1 ? "máquina" : "máquinas"} en el almacén.`}
            </span>
          </div>
        ))}
      {/* Consolidado (Santos 23-10): las dos empresas en los mismos bloques por marca, con el cuadrito de la empresa en cada fila. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <span className="w-24 text-xs font-semibold text-foreground">Consolidado</span>
        {boton(`/api/operaciones/stock/general?doc=industriales&empresa=TODAS`, "Industriales (PDF)")}
        {boton(`/api/operaciones/stock/general?doc=lg&empresa=TODAS`, "LG (PDF)")}
        <span className="text-xs text-muted-foreground">Open y Efameinsa juntas por marca; cada fila dice de qué empresa es ({porEmpresa.OPEN + porEmpresa.EFAMEINSA} máquinas).</span>
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
