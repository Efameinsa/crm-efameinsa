import Link from "next/link";
import { ArrowRight, Check, Clock, Send, X } from "lucide-react";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import type { EstadoMandado, Mandado } from "@/lib/mandado-a-central";
import { cn } from "@/lib/utils";

/**
 * «Lo que mandé a Central» — la comprobación que faltaba.
 *
 * El porqué está entero en `src/lib/mandado-a-central.ts`: postventa registró
 * dos veces la misma solicitud el 10-09 porque, entre que ella la registra y
 * Central la deriva, el caso no aparece en ninguna pantalla suya.
 *
 * SE MUESTRA SIEMPRE, también vacío. Es a propósito y es la regla de la casa
 * del 09-09 —«le frustra al usuario si no explicas la razón»—: un panel que
 * solo existe cuando hay algo no enseña dónde mirar, y esta pantalla se abre
 * justamente con la duda de si el CRM perdió el trabajo. Vacío contesta que no
 * hay nada esperando, que es la respuesta que se vino a buscar.
 */

const ICONO: Record<EstadoMandado, typeof Send> = {
  esperando: Clock,
  en_camino: Send,
  devuelto: ArrowRight,
  derivado: ArrowRight,
  cerrado: X,
};

/** Verde solo para lo que volvió a sus manos: es lo único que ya puede trabajar. */
const COLOR: Record<EstadoMandado, string> = {
  esperando: "bg-secondary text-muted-foreground",
  en_camino: "bg-secondary text-muted-foreground",
  devuelto: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  derivado: "bg-secondary text-muted-foreground",
  cerrado: "bg-secondary text-muted-foreground",
};

export function MandadoACentral({
  filas,
  contexto = "postventa",
}: {
  filas: Mandado[];
  contexto?: "postventa" | "comercial";
}) {
  const esperando = filas.filter((f) => f.estado === "esperando").length;
  const demorados = filas.filter((f) => f.demorado).length;

  return (
    <SeccionPanel
      titulo="Lo que mandé a Central"
      accion={
        esperando > 0 ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              demorados > 0 ? "bg-amber-100 text-amber-900" : "bg-secondary text-foreground",
            )}
          >
            {esperando} esperando
            {demorados > 0 && ` · ${demorados} hace rato`}
          </span>
        ) : undefined
      }
    >
      {filas.length === 0 ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          Nada esperando en Central. Lo que registre acá{" "}
          {contexto === "postventa"
            ? "—una atención, o un contacto que llamó directo—"
            : "—un contacto que le escribió directo—"}{" "}
          entra primero a la cola de Central y aparece en esta lista con su código, hasta que lo deriven. Así se sabe
          que no se perdió, sin volver a registrarlo.
        </p>
      ) : (
        <div className="space-y-1.5">
          {filas.map((f) => {
            const Icono = ICONO[f.estado];
            const contenido = (
              <>
                <span className={cn("flex size-7 flex-none items-center justify-center rounded-full", COLOR[f.estado])}>
                  {f.estado === "cerrado" ? <Check className="size-3.5" /> : <Icono className="size-3.5" />}
                </span>
                <span className="min-w-[200px] flex-1">
                  <span className="block text-sm font-medium text-foreground">{f.cliente}</span>
                  <span className="block text-xs text-muted-foreground">{f.frase}</span>
                </span>
                <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {f.codigo}
                </span>
                {f.href && <ArrowRight className="size-3.5 flex-none text-muted-foreground" />}
              </>
            );
            const clases = cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2.5",
              f.demorado ? "border-amber-400/60 bg-amber-500/10" : "border-border",
              f.href && "transition-colors hover:bg-accent",
            );
            return f.href ? (
              <Link key={f.id} href={f.href} className={clases}>
                {contenido}
              </Link>
            ) : (
              <div key={f.id} className={clases}>
                {contenido}
              </div>
            );
          })}
        </div>
      )}
    </SeccionPanel>
  );
}
