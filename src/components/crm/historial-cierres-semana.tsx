import { CalendarCheck, CircleAlert, HandHelping, Target } from "lucide-react";
import type { SemanaCerrada } from "@/lib/historial-semanas";
import { BotonCierreSemanal } from "@/components/crm/boton-cierre-semanal";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaCalendario } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * Los cierres de semana, uno debajo del otro.
 *
 * Carlos, 02-09: «también debería haber un histórico, ¿no? De todos sus
 * cierres». Sirve para una cosa concreta: el lunes se abre el de la semana
 * pasada y se pregunta «esto que dijiste, ¿lo hiciste?». Por eso lo que se ve
 * de cada semana no son los números —esos están en el PDF— sino LO QUE DIJO:
 * a qué se comprometió y qué pidió.
 *
 * Las necesidades van marcadas aparte y con su propio color, porque son lo
 * único de acá que le toca resolver a gerencia.
 */
export function HistorialCierresSemana({
  semanas,
  comercialId,
  esGerencia,
}: {
  semanas: SemanaCerrada[];
  /** Solo cuando gerencia mira a otro: el PDF se pide con su id. */
  comercialId?: string;
  esGerencia: boolean;
}) {
  const conAlgo = semanas.filter((s) => s.declaradoAt || s.ventas > 0 || s.esLaActual);
  const pendientes = semanas.filter((s) => !s.declaradoAt && !s.esLaActual && s.ventas > 0).length;

  return (
    <SeccionPanel titulo="Sus cierres de semana">
      <p className="mb-3 text-xs text-muted-foreground">
        Lo que se declaró cada sábado. El detalle con los números está en el documento de cada semana.
        {pendientes > 0 && (
          <span className="ml-1 font-medium text-amber-700">
            {pendientes} semana{pendientes === 1 ? "" : "s"} con ventas y sin cerrar.
          </span>
        )}
      </p>

      <ul className="space-y-2">
        {conAlgo.map((s) => (
          <li
            key={s.lunes}
            className={cn(
              "rounded-lg border p-3",
              s.esLaActual ? "border-primary/40 bg-primary/5" : "border-border bg-card",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {fechaCalendario(s.lunes)} — {fechaCalendario(s.sabado)}
                </span>
                {s.esLaActual && (
                  <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                    Esta semana
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm tabular-nums text-foreground">
                  US$ {Math.round(s.vendidoUsd).toLocaleString("es-PE")}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {s.ventas} venta{s.ventas === 1 ? "" : "s"}
                </span>
                <BotonCierreSemanal
                  semana={s.lunes}
                  comercialId={comercialId}
                  etiqueta={s.declaradoAt ? "Ver" : "Cerrar"}
                  compacto
                />
              </div>
            </div>

            {s.declaradoAt ? (
              <div className="mt-2.5 space-y-2 border-t border-border/70 pt-2.5">
                <p className="flex gap-2 text-xs leading-relaxed text-foreground">
                  <Target className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span>{s.compromiso}</span>
                </p>
                <p className="flex gap-2 text-xs leading-relaxed">
                  <HandHelping className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                  {s.sinNecesidades ? (
                    <span className="text-muted-foreground">No pidió nada esa semana.</span>
                  ) : (
                    <span className="font-medium text-amber-800 dark:text-amber-500">{s.necesidades}</span>
                  )}
                </p>
              </div>
            ) : (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                {s.esLaActual ? (
                  <>
                    <CalendarCheck className="size-3.5" />
                    {esGerencia ? "Todavía no cerró la semana." : "Todavía no cerró esta semana."}
                  </>
                ) : (
                  <>
                    <CircleAlert className="size-3.5 text-amber-600" /> Sin cerrar.
                  </>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
    </SeccionPanel>
  );
}
