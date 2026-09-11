"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { marcarPendiente, useNavegacionPendiente } from "@/lib/navegacion-pendiente";
import { cn } from "@/lib/utils";

/**
 * Envuelve una tabla que se recarga desde el servidor y la atenúa —con el
 * indicador encima— desde el instante del clic hasta que llega la página nueva.
 *
 * Se entera de dos formas: por `marcarPendiente()` (los filtros y la
 * paginación lo llaman al navegar) y por cualquier clic en un enlace interno
 * que esté adentro —las filas que abren una ficha, un «Siguiente» hecho con
 * Link—. Se limpia sola cuando cambia la URL, que es la prueba de que la
 * respuesta llegó; y por si algo no llega nunca, a los 15 segundos.
 *
 * Es la parte visible de lo que Santos pidió el 11-09 para las listas que
 * paginan: no hacerlas más rápidas (ya lo son) sino que se note que
 * respondieron al clic.
 */
export function EsperaDeNavegacion({ children, className }: { children: React.ReactNode; className?: string }) {
  const pendienteGlobal = useNavegacionPendiente();
  const [pendienteLocal, setPendienteLocal] = useState(false);
  const pathname = usePathname();
  const sp = useSearchParams();
  const clave = `${pathname}?${sp.toString()}`;
  const claveAnterior = useRef(clave);

  // Llegó otra URL: sea lo que sea que se pidió, ya está.
  useEffect(() => {
    if (claveAnterior.current !== clave) {
      claveAnterior.current = clave;
      setPendienteLocal(false);
      marcarPendiente(false);
    }
  }, [clave]);

  const pendiente = pendienteGlobal || pendienteLocal;
  useEffect(() => {
    if (!pendiente) return;
    const t = setTimeout(() => {
      setPendienteLocal(false);
      marcarPendiente(false);
    }, 15000);
    return () => clearTimeout(t);
  }, [pendiente]);

  function alClic(e: React.MouseEvent<HTMLDivElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const enlace = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    if (!enlace || enlace.target === "_blank" || enlace.hasAttribute("download")) return;
    const href = enlace.getAttribute("href") ?? "";
    if (!href.startsWith("/")) return;
    setPendienteLocal(true);
  }

  return (
    <div className={cn("relative", className)} onClickCapture={alClic} aria-busy={pendiente || undefined}>
      <div className={cn("transition-opacity duration-200", pendiente && "pointer-events-none opacity-45")}>{children}</div>
      {pendiente && (
        <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-md">
            <Loader2 className="size-3.5 animate-spin text-primary" /> Cargando…
          </span>
        </div>
      )}
    </div>
  );
}
