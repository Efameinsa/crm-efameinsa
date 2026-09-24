"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * LA BARRITA DE PROGRESO DE LA PROPUESTA (24-09). Santos: «esta lento… me
 * fui a clientes y se demora». Además de acelerar la consulta, el clic tiene
 * que responder AL INSTANTE: apenas se toca un enlace interno aparece una
 * línea de color arriba que avanza, y se va cuando llega la pantalla nueva.
 * Así nunca parece que el clic no se tomó.
 */
function Barra() {
  const ruta = usePathname();
  const busqueda = useSearchParams();
  // Se recuerda DESDE qué pantalla se tocó: en cuanto la dirección cambia
  // (llegó la nueva), deja de coincidir y la barra se va sola.
  const actual = `${ruta}?${busqueda.toString()}`;
  const [cargando, setCargando] = useState<{ desde: string; destino: string } | null>(null);
  const visible = cargando !== null && cargando.desde === actual;

  useEffect(() => {
    const alTocar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const destino = new URL(a.href, location.href);
      if (destino.origin !== location.origin) return;
      // Solo un ancla dentro de la misma pantalla: no hay nada que esperar.
      if (destino.pathname === location.pathname && destino.search === location.search) return;
      // Misma forma que `actual` (URLSearchParams serializa igual que useSearchParams).
      setCargando({ desde: `${location.pathname}?${new URLSearchParams(location.search).toString()}`, destino: destino.href });
    };
    document.addEventListener("click", alTocar, true);
    return () => document.removeEventListener("click", alTocar, true);
  }, []);

  // Por si la navegación se cancela: nunca queda pegada más de 12 s.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setCargando(null), 12_000);
    return () => clearTimeout(t);
  }, [visible]);

  return visible ? <div key={cargando.destino} className="barra-progreso" role="progressbar" aria-label="Cargando" /> : null;
}

export function BarraProgreso() {
  return (
    <Suspense fallback={null}>
      <Barra />
    </Suspense>
  );
}
