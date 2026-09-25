import { SeccionPanel } from "@/components/crm/seccion-panel";
import { FilaMandado } from "@/components/crm/mandado-a-central-fila";
import type { Mandado } from "@/lib/mandado-a-central";
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
 *
 * CADA FILA SE ABRE (17-09): el detalle de lo que se mandó —texto completo,
 * teléfono, adjuntos, a quién fue— vive en `FilaMandado`, en una ventana.
 */

export function MandadoACentral({
  filas,
  contexto = "postventa",
}: {
  filas: Mandado[];
  contexto?: "postventa" | "comercial" | "almacen";
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
            : contexto === "almacen"
              ? "—un cliente que llamó directo al almacén—"
              : "—un contacto que le escribió directo—"}{" "}
          entra primero a la cola de Central y aparece en esta lista con su código, hasta que lo deriven. Así se sabe
          que no se perdió, sin volver a registrarlo.
        </p>
      ) : (
        <div className="space-y-1.5">
          {filas.map((f) => (
            <FilaMandado key={f.id} fila={f} />
          ))}
        </div>
      )}
    </SeccionPanel>
  );
}
