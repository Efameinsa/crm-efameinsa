import { CheckCircle2, XCircle, FileDown } from "lucide-react";
import { fechaHoraLima } from "@/lib/fechas";
import { SeccionPlegable } from "@/components/crm/seccion-panel";
import { cn } from "@/lib/utils";

/**
 * Lo que gerencia ya resolvió.
 *
 * POR QUÉ EXISTE. El ing. Carlos, el 25-08, al terminar de aprobar la primera
 * cotización: «si ya aprobaste, no puedes ver lo que aprobaste, entonces tiene
 * que haber un historial… para saber por qué me manda Brenda». Hasta ahora la
 * bandeja solo mostraba lo pendiente: en cuanto decidía, la cotización
 * desaparecía de su pantalla y con ella el precio que había autorizado.
 *
 * Eso importa más desde que la aprobación quedó reservada a los descuentos
 * (migración 0074): cuando el mismo comercial vuelve a pedir una rebaja sobre
 * el mismo equipo, la pregunta es «¿cuánto le autoricé la vez pasada?», y la
 * respuesta tiene que estar a la vista. Por eso cada línea muestra la
 * referencia, lo que se pidió y la nota que gerencia dejó escrita.
 *
 * Va plegada: es consulta, no trabajo del día.
 */
export interface FilaHistorial {
  id: string;
  codigo: string | null;
  serie: string;
  total: number;
  moneda: string;
  estado: string;
  estado_aprobacion: string;
  aprobada_at: string | null;
  nota_gerencia: string | null;
  enviada_at: string | null;
  oportunidades: unknown;
  cotizacion_items: unknown;
}

interface ItemHist {
  cantidad: number;
  precio_lista: number | null;
  precio_unitario: number;
  bajo_lista: boolean;
  aprobado: boolean | null;
  descripcion: string | null;
  productos: { marca: string; modelo: string; nombre: string } | null;
}

export function HistorialAprobaciones({ filas }: { filas: FilaHistorial[] }) {
  if (filas.length === 0) return null;

  return (
    <SeccionPlegable titulo="Lo que ya resolvió" cantidad={filas.length}>
      <div className="space-y-2">
        {filas.map((c) => {
          const op = c.oportunidades as { cuentas: { razon_social: string } | null; perfiles: { nombre: string } | null } | null;
          const items = ((c.cotizacion_items as ItemHist[]) ?? []).filter((i) => i.aprobado !== null);
          const rechazada = c.estado_aprobacion === "rechazada_gerencia";
          const cedido = items
            .filter((i) => i.aprobado && i.precio_lista != null)
            .reduce((s, i) => s + (Number(i.precio_lista) - Number(i.precio_unitario)) * i.cantidad, 0);
          return (
            <div key={c.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {op?.cuentas?.razon_social ?? "Cuenta sin nombre"}
                </p>
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    rechazada ? "bg-destructive/10 text-destructive" : "bg-[#1E7F4F]/10 text-[#1E7F4F]",
                  )}
                >
                  {rechazada ? <XCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
                  {rechazada ? "Rechazada" : "Aprobada"}
                  {c.aprobada_at && ` · ${fechaHoraLima(c.aprobada_at)}`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{c.codigo ?? "Borrador"}</span> · Serie {c.serie} · De{" "}
                {op?.perfiles?.nombre ?? "un comercial"} · {c.moneda} {Number(c.total).toLocaleString("es-PE")}
                {c.enviada_at ? " · ya enviada al cliente" : " · todavía sin enviar"}
                {cedido > 0 && (
                  <span className="font-semibold text-foreground">
                    {" "}
                    · se autorizaron {c.moneda} {Math.round(cedido).toLocaleString("es-PE")} de rebaja
                  </span>
                )}
              </p>

              {items.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {items.map((i, j) => (
                    <p key={j} className="text-[11px] tabular-nums text-muted-foreground">
                      <span className={cn("font-semibold", i.aprobado ? "text-[#1E7F4F]" : "text-destructive")}>
                        {i.aprobado ? "✓" : "✗"}
                      </span>{" "}
                      {i.productos ? `${i.productos.marca} ${i.productos.modelo}` : (i.descripcion ?? "Equipo")} ·
                      referencia {i.precio_lista != null ? Number(i.precio_lista).toLocaleString("es-PE") : "—"} ·
                      autorizado {Number(i.precio_unitario).toLocaleString("es-PE")}
                    </p>
                  ))}
                </div>
              )}

              {c.nota_gerencia && (
                <p className="mt-1.5 rounded-md bg-secondary/60 p-2 text-xs italic text-foreground">
                  «{c.nota_gerencia}»
                </p>
              )}

              <a
                href={`/api/cotizaciones/${c.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <FileDown className="size-3.5" />
                Ver PDF
              </a>
            </div>
          );
        })}
      </div>
    </SeccionPlegable>
  );
}
