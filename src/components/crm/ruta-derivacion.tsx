import { Check, Clock, X } from "lucide-react";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * La ruta que siguió el contacto: llegó, se derivó, alguien lo llamó, se
 * cotizó, se cerró — con el tiempo que pasó entre un paso y el siguiente.
 *
 * Es lo que Central pedía el 27-08 («debería haber más detalle, rutas»): no
 * un estado suelto sino el recorrido, porque cuando el cliente vuelve a llamar
 * lo que ella tiene que poder decir es en qué punto se quedó y cuánto lleva
 * ahí. Los tiempos entre pasos son además la medida de supervisión que
 * gerencia venía sacando a mano: cuánto tardó en derivarse y —el que faltaba—
 * cuánto tardó el comercial en hacer el primer contacto.
 */

export interface Hito {
  titulo: string;
  /** Instante en que ocurrió (timestamptz). null = todavía no pasa. */
  fecha: string | null;
  /** Qué pasó, en palabras: «a C5 · Katerine», «Llamada», … */
  detalle?: string | null;
  /** Cuánto tardó desde el hito anterior. */
  demora?: string | null;
  /** Qué decir cuando todavía no pasó. */
  pendiente?: string;
  /** El paso no llegó a ocurrir y ya no va a ocurrir (venta perdida). */
  fallido?: boolean;
  /** El paso lleva demasiado tiempo sin ocurrir: se pinta como reclamo. */
  alerta?: boolean;
}

export function RutaDerivacion({ hitos }: { hitos: Hito[] }) {
  return (
    <ol className="space-y-0">
      {hitos.map((h, i) => {
        const cumplido = h.fecha !== null;
        const ultimo = i === hitos.length - 1;
        const Icono = h.fallido ? X : cumplido ? Check : Clock;
        return (
          <li key={h.titulo} className="relative flex gap-3 pb-4 last:pb-0">
            {!ultimo && <span className="absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px bg-border" aria-hidden />}
            <span
              className={cn(
                "flex size-7 flex-none items-center justify-center rounded-full",
                h.fallido
                  ? "bg-destructive/10 text-destructive"
                  : cumplido
                    ? "bg-[#1E7F4F]/10 text-[#1E7F4F]"
                    : h.alerta
                      ? "bg-destructive/10 text-destructive"
                      : "bg-secondary text-muted-foreground",
              )}
            >
              <Icono className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className={cn("text-sm font-semibold", cumplido ? "text-foreground" : "text-muted-foreground")}>
                  {h.titulo}
                </span>
                {h.demora && cumplido && (
                  <span className="text-xs tabular-nums text-muted-foreground">+{h.demora}</span>
                )}
              </div>
              {cumplido ? (
                <p className="text-xs text-muted-foreground">
                  {fechaHoraLima(h.fecha)}
                  {h.detalle ? ` · ${h.detalle}` : ""}
                </p>
              ) : (
                <p className={cn("text-xs", h.alerta ? "font-semibold text-destructive" : "text-muted-foreground")}>
                  {h.pendiente ?? "Todavía no"}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
