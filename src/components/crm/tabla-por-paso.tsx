import Link from "next/link";
import { Check, CircleDashed, OctagonAlert } from "lucide-react";
import { fechaLimaCorta } from "@/lib/fechas";
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

  const pendientesPor = (clave: string) => filas.filter((f) => f.pasos.some((p) => p.clave === clave && !p.hecho)).length;
  const visibles = falta ? filas.filter((f) => f.pasos.some((p) => p.clave === falta && !p.hecho)) : filas;
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
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ningún pedido tiene ese paso pendiente.</p>
      ) : (
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
              {visibles.map((f) => {
                // El siguiente paso que le toca: el primero sin hacer, en orden.
                const siguiente = f.pasos.find((p) => !p.hecho)?.clave ?? null;
                return (
                  <tr key={f.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                    <td className="sticky left-0 bg-card px-2 py-1.5">
                      <Link href={`/postventa/pedidos/${f.id}`} className="block min-w-44 hover:underline">
                        <span className="block truncate font-semibold text-foreground" title={f.cliente}>
                          {f.cliente}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground" title={f.equipo}>
                          {f.equipo}
                        </span>
                      </Link>
                    </td>
                    {columnas.map((c) => {
                      const p = f.pasos.find((x) => x.clave === c.clave);
                      if (!p) return <td key={c.clave} className="px-2 py-1.5 text-center text-muted-foreground/40">·</td>;
                      const esSiguiente = c.clave === siguiente;
                      return (
                        <td
                          key={c.clave}
                          className={cn("px-2 py-1.5 text-center align-middle", falta === c.clave && !p.hecho && "bg-primary/5")}
                          title={p.hecho ? `${p.etiqueta} · ${p.cuando ? fechaLimaCorta(p.cuando) : "hecho"}` : p.trabado ? `${p.etiqueta} · ${p.trabado}` : `${p.etiqueta} · le toca a ${p.dueno}`}
                        >
                          {p.hecho ? (
                            <span className="inline-flex flex-col items-center text-[#1E7F4F]">
                              <Check className="size-4" />
                              {p.cuando && <span className="text-[10px] tabular-nums text-muted-foreground">{fechaLimaCorta(p.cuando)}</span>}
                            </span>
                          ) : p.trabado ? (
                            <span className="inline-flex flex-col items-center text-destructive">
                              <OctagonAlert className="size-4" />
                              <span className="text-[10px]">{p.dueno}</span>
                            </span>
                          ) : esSiguiente ? (
                            <span className="inline-flex flex-col items-center text-amber-700">
                              <CircleDashed className="size-4" />
                              <span className="text-[10px] font-medium">{p.dueno}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
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
