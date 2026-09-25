import { FileText, Printer, ReceiptText } from "lucide-react";
import { etiquetaEstadoPago, type DocumentosDeFinanzas } from "@/lib/documentos-finanzas";
import { cn } from "@/lib/utils";

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const diaDe = (fecha: string) => new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString("es-PE", { timeZone: "America/Lima" });

const TONO_PAGO: Record<string, string> = {
  cancelado: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  pago_parcial: "bg-amber-100 text-amber-900",
  pendiente_pago: "bg-destructive/10 text-destructive",
  sin_dato: "bg-secondary text-muted-foreground",
};

/**
 * LIQUIDACIONES Y FACTURAS DE UN PEDIDO, PARA ABRIR E IMPRIMIR (0306).
 *
 * Yasmín, 25-09: después de liberar el pedido «ya no tengo acceso a verla».
 * Gerencia: Central imprime la liquidación y la factura para el expediente
 * físico. La vigente va primero y marcada; las anteriores quedan debajo.
 */
export function DocumentosFinanzasLista({ docs, titulo = true }: { docs: DocumentosDeFinanzas | undefined; titulo?: boolean }) {
  const liq = docs?.liquidaciones ?? [];
  const fac = docs?.facturas ?? [];
  if (liq.length === 0 && fac.length === 0) {
    return <p className="text-xs text-muted-foreground">Todavía no hay liquidación ni factura en este pedido.</p>;
  }
  return (
    <div className="grid gap-3 text-xs sm:grid-cols-2">
      <div>
        {titulo && (
          <p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <FileText className="size-3.5" /> Liquidaciones · {liq.length}
          </p>
        )}
        {liq.length === 0 ? (
          <p className="text-muted-foreground">Finanzas todavía no sube la liquidación.</p>
        ) : (
          <ul className="space-y-1.5">
            {liq.map((l, k) => (
              <li key={l.id} className={cn("rounded-md border border-border p-2", k === 0 && "border-primary/40")}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {k === 0 && <span className="rounded bg-primary px-1.5 text-[10px] font-bold uppercase text-primary-foreground">Vigente</span>}
                  <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", TONO_PAGO[l.estadoPago] ?? TONO_PAGO.sin_dato)}>
                    {etiquetaEstadoPago(l.estadoPago)}
                  </span>
                  <span className="font-mono text-[11px] text-foreground">{l.facturaNumero ? `Factura ${l.facturaNumero}` : "Factura pendiente"}</span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {cuando(l.subidaAt)}
                  {l.subidaPor ? ` · ${l.subidaPor}` : ""}
                  {l.nota ? ` · ${l.nota}` : ""}
                </p>
                {l.url && (
                  <a href={l.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    <Printer className="size-3.5" /> Abrir / imprimir
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        {titulo && (
          <p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <ReceiptText className="size-3.5" /> Facturas · {fac.length}
          </p>
        )}
        {fac.length === 0 ? (
          <p className="text-muted-foreground">Facturación todavía no registra la factura.</p>
        ) : (
          <ul className="space-y-1.5">
            {fac.map((f) => (
              <li key={f.id} className="rounded-md border border-border p-2">
                <p className="font-mono text-sm font-semibold text-foreground">{f.numero}</p>
                <p className="text-muted-foreground">
                  Emitida el {diaDe(f.fechaEmision)}
                  {f.registradaPor ? ` · registró ${f.registradaPor}` : ""}
                  {f.nota ? ` · ${f.nota}` : ""}
                </p>
                {f.url ? (
                  <a href={f.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    <Printer className="size-3.5" /> Abrir / imprimir
                  </a>
                ) : (
                  <p className="mt-1 text-muted-foreground">Sin PDF adjunto.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
