"use client";

import { useId, useMemo, useState } from "react";
import { sugerirModelos, textoDelModelo, type ModeloCatalogo } from "@/lib/modelos-catalogo";
import { cn } from "@/lib/utils";

/**
 * «Modelo de la máquina» con las sugerencias del catálogo (reunión 28-09:
 * «va arrojando el desplegado de los equipos. Y va poniendo Titan, que se
 * vaya recomendando… y también que te permita escribir»).
 *
 * Mientras se escribe, abajo salen los equipos del catálogo que casan; un clic
 * (o flechas y Enter) pone el nombre completo. Si no es ninguno —una máquina
 * de la competencia— se escribe libre y queda así.
 */
export function ModeloDeMaquina({
  valor,
  onCambiar,
  catalogo,
  etiqueta,
  className,
}: {
  valor: string;
  /** El texto, y el producto del catálogo si se eligió una sugerencia. */
  onCambiar: (texto: string, producto: ModeloCatalogo | null) => void;
  catalogo: ModeloCatalogo[];
  etiqueta: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const [abierta, setAbierta] = useState(false);
  const [marcada, setMarcada] = useState(0);
  const sugerencias = useMemo(() => sugerirModelos(catalogo, valor), [catalogo, valor]);
  // Si lo escrito ya es exactamente la sugerencia, no hay nada que mostrar.
  const visibles = sugerencias.filter((p) => textoDelModelo(p) !== valor.trim());
  const mostrar = abierta && visibles.length > 0;

  const elegir = (p: ModeloCatalogo) => {
    onCambiar(textoDelModelo(p), p);
    setAbierta(false);
  };

  return (
    <div className={cn("relative space-y-1.5", className)}>
      <label htmlFor={`${id}-modelo`} className="block text-sm font-medium text-foreground">
        {etiqueta}
      </label>
      <input
        id={`${id}-modelo`}
        value={valor}
        onChange={(e) => {
          onCambiar(e.target.value, null);
          setAbierta(true);
          setMarcada(0);
        }}
        onFocus={() => setAbierta(true)}
        // El retraso deja que el clic en una sugerencia llegue antes de cerrar.
        onBlur={() => setTimeout(() => setAbierta(false), 150)}
        onKeyDown={(e) => {
          if (!mostrar) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setMarcada((m) => Math.min(m + 1, visibles.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setMarcada((m) => Math.max(m - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            elegir(visibles[marcada] ?? visibles[0]);
          } else if (e.key === "Escape") {
            setAbierta(false);
          }
        }}
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Escriba y elija del catálogo («Titan», «UT075»…) o escríbalo tal cual"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
      />
      {mostrar && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {visibles.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === marcada}>
              <button
                type="button"
                // mousedown y no click: el input pierde el foco en el mousedown.
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(p);
                }}
                onMouseEnter={() => setMarcada(i)}
                className={cn(
                  "block w-full cursor-pointer rounded px-2.5 py-2 text-left text-sm",
                  i === marcada ? "bg-accent text-foreground" : "text-foreground/90",
                )}
              >
                {textoDelModelo(p)}
              </button>
            </li>
          ))}
          <li className="px-2.5 pb-1 pt-1.5 text-[11px] text-muted-foreground">
            ¿No está? Siga escribiendo: se guarda tal cual (máquinas de la competencia).
          </li>
        </ul>
      )}
    </div>
  );
}
