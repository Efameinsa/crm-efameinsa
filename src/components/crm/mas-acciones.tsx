"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * «MÁS ACCIONES» DE LA FICHA (17-10). Siete botones del mismo tamaño en la
 * cabecera no dejaban ver cuál era el de todos los días. Los de vez en cuando
 * se guardan acá. No es un menú desplegable a propósito: varios de estos
 * botones abren su propio diálogo y, dentro de un menú que se cierra al
 * hacer clic, el diálogo se desmontaría con él. Acá quedan montados.
 */
export function MasAcciones({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
      >
        Más acciones <ChevronDown className={cn("size-3.5 transition-transform", abierto && "rotate-180")} />
      </button>
      <div className={cn("basis-full flex-wrap items-center justify-end gap-1.5", abierto ? "flex" : "hidden")}>{children}</div>
    </>
  );
}
