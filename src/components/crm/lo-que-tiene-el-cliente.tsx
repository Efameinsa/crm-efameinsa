"use client";

import { FileText, Package, Wrench, ShoppingBag } from "lucide-react";
import { fechaCalendario } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import type { LoQueTieneElCliente } from "@/lib/lo-que-tiene-el-cliente";

/**
 * «Lo que tiene este cliente», en el cotizador de postventa (Santos, 26-09).
 * Qué máquinas tiene, desde cuándo, si sigue en garantía y cuándo tocaba el
 * preventivo; qué compró y qué servicios ya se le hicieron. Sin montos.
 * Tocar una máquina busca en el catálogo por su modelo: lo que se viene a
 * cotizar casi siempre es el mantenimiento o un repuesto de esa máquina.
 */
export function LoQueTieneElClientePanel({
  datos,
  hoy,
  onBuscar,
}: {
  datos: LoQueTieneElCliente;
  /** AAAA-MM-DD en Lima, calculado en el servidor (no cambia al hidratar). */
  hoy: string;
  onBuscar: (texto: string) => void;
}) {
  const { equipos, compras, pedidos, cotizado } = datos;
  const vacio = equipos.length === 0 && compras.length === 0 && pedidos.length === 0 && cotizado.length === 0;

  return (
    <details open className="rounded-lg border border-border bg-card p-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Lo que tiene este cliente</span>
        <span className="text-[11px] text-muted-foreground">
          {vacio
            ? "sin compras registradas"
            : [
                equipos.length && `${equipos.length} equipo${equipos.length === 1 ? "" : "s"}`,
                compras.length && `${compras.length} compra${compras.length === 1 ? "" : "s"}`,
                pedidos.length && `${pedidos.length} pedido${pedidos.length === 1 ? "" : "s"}`,
                cotizado.length && `${cotizado.length} cotizaci${cotizado.length === 1 ? "ón" : "ones"}`,
              ]
                .filter(Boolean)
                .join(" · ")}
        </span>
      </summary>

      {vacio ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No hay equipos, compras ni pedidos registrados para este cliente en el CRM. Si compró antes del sistema,
          puede estar en el archivo de cierres del servidor.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {equipos.length > 0 && (
            <section className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Package className="size-3.5" /> Sus equipos · toque uno para buscar su mantenimiento o repuesto
              </p>
              {equipos.map((e) => {
                const enGarantia = e.garantiaHasta != null && e.garantiaHasta >= hoy;
                const preventivoVencido = e.proximoMantenimiento != null && e.proximoMantenimiento < hoy;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onBuscar(e.equipo)}
                    className="flex w-full cursor-pointer flex-col gap-0.5 rounded-md border border-border bg-background px-2.5 py-2 text-left text-xs hover:bg-accent"
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-foreground">{e.equipo}</span>
                      {e.serie && <span className="text-muted-foreground">serie {e.serie}</span>}
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          enGarantia ? "bg-emerald-100 text-emerald-800" : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {e.garantiaHasta
                          ? enGarantia
                            ? `En garantía hasta ${fechaCalendario(e.garantiaHasta)}`
                            : `Garantía vencida el ${fechaCalendario(e.garantiaHasta)}`
                          : "Sin dato de garantía"}
                      </span>
                      {preventivoVencido && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                          Preventivo vencido desde {fechaCalendario(e.proximoMantenimiento)}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {[
                        e.comprado && `Comprado el ${fechaCalendario(e.comprado)}`,
                        e.ultimoMantenimiento && `último mantenimiento ${fechaCalendario(e.ultimoMantenimiento)}`,
                        !preventivoVencido && e.proximoMantenimiento && `próximo ${fechaCalendario(e.proximoMantenimiento)}`,
                        e.ubicacion,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sin fechas registradas"}
                    </span>
                  </button>
                );
              })}
            </section>
          )}

          {compras.length > 0 && (
            <section className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <ShoppingBag className="size-3.5" /> Lo que compró
              </p>
              {compras.map((c, i) => (
                <div key={`${c.fecha}-${i}`} className="rounded-md border border-border bg-background px-2.5 py-2 text-xs">
                  <p className="text-muted-foreground">
                    <span className="font-semibold text-foreground">{fechaCalendario(c.fecha)}</span>
                    {c.documento && ` · cotización ${c.documento}`}
                    {c.empresa && ` · ${c.empresa === "OPEN" ? "Open" : c.empresa === "EFAMEINSA" ? "Efameinsa" : c.empresa}`}
                  </p>
                  {c.lineas.length > 0 ? (
                    <ul className="mt-0.5 list-disc pl-4 text-foreground">
                      {c.lineas.slice(0, 5).map((l, j) => (
                        <li key={j}>{l}</li>
                      ))}
                      {c.lineas.length > 5 && <li className="text-muted-foreground">y {c.lineas.length - 5} más</li>}
                    </ul>
                  ) : (
                    <p className="mt-0.5 text-muted-foreground">Venta sin detalle de equipos.</p>
                  )}
                </div>
              ))}
            </section>
          )}

          {cotizado.length > 0 && (
            <section className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="size-3.5" /> Lo que se le cotizó
              </p>
              {cotizado.map((c, i) => (
                <div key={`${c.documento}-${i}`} className="rounded-md border border-border bg-background px-2.5 py-2 text-xs">
                  <p className="text-muted-foreground">
                    <span className="font-semibold text-foreground">{fechaCalendario(c.fecha)}</span>
                    {c.documento && ` · ${c.documento}`}
                    {c.empresa && ` · ${c.empresa === "OPEN" ? "Open" : c.empresa === "EFAMEINSA" ? "Efameinsa" : c.empresa}`}
                    {c.estado && ` · ${c.estado}`}
                  </p>
                  {c.lineas.length > 0 && (
                    <p className="mt-0.5 text-foreground">{c.lineas.slice(0, 4).join(" · ")}{c.lineas.length > 4 ? ` y ${c.lineas.length - 4} más` : ""}</p>
                  )}
                </div>
              ))}
            </section>
          )}

          {pedidos.length > 0 && (
            <section className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Wrench className="size-3.5" /> Pedidos y servicios
              </p>
              {pedidos.map((p, i) => (
                <p key={i} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{fechaCalendario(p.fecha)}</span> · {p.tipo}
                  {p.equipo && ` · ${p.equipo}`} · {p.estado}
                </p>
              ))}
            </section>
          )}
        </div>
      )}
    </details>
  );
}
