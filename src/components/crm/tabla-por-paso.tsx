import Link from "@/components/enlace";
import { Check, CircleDashed, OctagonAlert } from "lucide-react";
import { FilasPorPaso } from "@/components/crm/filas-por-paso";
import { cn } from "@/lib/utils";

/**
 * El control de pedidos visto POR PASO: una fila por pedido, una columna por
 * paso del circuito, y filtros «falta X» que dejan solo los pedidos a los que
 * les falta ese paso.
 *
 * Carlos, 02-09, mirando el tablero de fases: «cuando tú tienes 20 pedidos,
 * pero no a todos les has enviado el plano de preinstalación… tengo que tener
 * una visión general de cuáles son mis pendientes: a quiénes no les he enviado
 * el plano, a quiénes no he despachado, a quiénes no he probado y embalado».
 *
 * NO REEMPLAZA el tablero de fases (lo diseñó Santos el 01-09 y sigue siendo
 * la vista por defecto): es la segunda vista, un clic al lado, para la
 * pregunta «¿a cuántos les falta tal cosa?». Los chips de arriba son la lista
 * de trabajo por paso: «Falta plano (4)» deja los cuatro y nada más.
 *
 * Es un componente de servidor a propósito: no hay estado, solo enlaces. La
 * fila se abre en la ficha del pedido, que es donde se marca cada paso.
 */

export interface PasoTabla {
  clave: string;
  etiqueta: string;
  hecho: boolean;
  cuando: string | null;
  trabado: string | null;
  dueno: string;
}

export interface FilaTabla {
  id: string;
  cliente: string;
  equipo: string;
  pasos: PasoTabla[];
}

/** Cómo se llama cada paso cuando hay que hacerlo caber en una cabecera. */
const CORTO: Record<string, string> = {
  pago: "Finanzas",
  aprobado: "Aprobado",
  prueba: "Probado y embalado",
  plano: "Plano",
  direccion: "Dirección",
  preinstalacion: "Preinstalación",
  apertura: "Apertura",
  despacho: "Despacho",
  puesta: "Puesta en marcha",
  cerrado: "Cerrado",
};

export function TablaPorPaso({ filas, falta, base }: { filas: FilaTabla[]; falta: string | null; base: string }) {
  // Las columnas salen de los pasos que existen en los pedidos, en su orden.
  const columnas: { clave: string; etiqueta: string }[] = [];
  for (const f of filas) for (const p of f.pasos) if (!columnas.some((c) => c.clave === p.clave)) columnas.push({ clave: p.clave, etiqueta: CORTO[p.clave] ?? p.etiqueta });

  // «prueba_sin_pedir» no es un paso: es la prueba pendiente que nadie le
  // pidió al almacén (el paso sin hacer y sin el «solicitado, sin respuesta»).
  // Reunión 23-09: la que se olvidó con Hortifrut.
  const debe = (f: FilaTabla, clave: string) =>
    clave === "prueba_sin_pedir"
      ? f.pasos.some((p) => p.clave === "prueba" && !p.hecho && !p.trabado) && !f.pasos.some((p) => p.clave === "despacho" && p.hecho)
      : f.pasos.some((p) => p.clave === clave && !p.hecho);
  const pendientesPor = (clave: string) => filas.filter((f) => debe(f, clave)).length;
  const visibles = falta ? filas.filter((f) => debe(f, falta)) : filas;
  const enlace = (clave: string | null) => `${base}?vista=paso${clave ? `&falta=${clave}` : ""}`;

  return (
    <div className="space-y-3">
      {/* Los pendientes por paso, de un toque. Es la pregunta de Carlos hecha botón. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={enlace(null)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            !falta ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-accent",
          )}
        >
          Todos ({filas.length})
        </Link>
        {columnas
          .filter((c) => c.clave !== "cerrado")
          .map((c) => {
            const n = pendientesPor(c.clave);
            return (
              <Link
                key={c.clave}
                href={enlace(c.clave)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  falta === c.clave
                    ? "border-primary bg-primary text-primary-foreground"
                    : n > 0
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20"
                      : "border-border bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                Falta {c.etiqueta.toLowerCase()} ({n})
              </Link>
            );
          })}
        {columnas.some((c) => c.clave === "prueba") && (
          <Link
            href={enlace("prueba_sin_pedir")}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
              falta === "prueba_sin_pedir"
                ? "border-primary bg-primary text-primary-foreground"
                : pendientesPor("prueba_sin_pedir") > 0
                  ? "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            Prueba sin pedir al almacén ({pendientesPor("prueba_sin_pedir")})
          </Link>
        )}
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ningún pedido tiene ese paso pendiente.</p>
      ) : (
        // EL CLIENTE NO ENSANCHA LA TABLA (Carlos, 16-09: «hay una barra
        // horizontal que se va mucho a la derecha… horrible»). El nombre y el
        // equipo se cortan con puntos suspensivos dentro de una columna de
        // ancho fijo; con 122 pedidos la tabla medía 5 700 px.
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 bg-secondary/40 px-2 py-2 font-medium">Pedido</th>
                {columnas.map((c) => (
                  <th key={c.clave} className={cn("px-2 py-2 text-center font-medium", falta === c.clave && "text-primary")}>
                    {c.etiqueta}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Reunión 23-09: una fila por empresa, desplegable a sus pedidos y su máquina. */}
              <FilasPorPaso filas={visibles} columnas={columnas} falta={falta} />
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        <Check className="mr-1 inline size-3 text-[#1E7F4F]" /> hecho, con su fecha ·{" "}
        <CircleDashed className="mr-1 inline size-3 text-amber-700" /> el paso que le toca ahora, y a quién ·{" "}
        <OctagonAlert className="mr-1 inline size-3 text-destructive" /> trabado por algo anterior · — todavía no le toca.
      </p>
    </div>
  );
}
