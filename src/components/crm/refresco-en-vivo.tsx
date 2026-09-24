"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * LA PANTALLA SE PONE AL DÍA SOLA (24-09; Santos: «para ver el paso en verde
 * hay que recargar la página, lo cual no es práctico»).
 *
 * No abre un canal nuevo a la base —el canal vivo de la campana ya cuesta
 * (ver 0293)—: escucha el aviso que la campana ya recibe («Series listas»,
 * «Liquidación lista», «Confirmar abono»…) y vuelve a pedir la pantalla. Lo
 * que el usuario está escribiendo no se pierde: router.refresh() solo trae
 * los datos nuevos.
 *
 * También se pone al día al volver a la pestaña después de un rato, para lo
 * que cambió sin aviso (una serie de dos, por ejemplo).
 */
export function RefrescoEnVivo() {
  const router = useRouter();
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oculta = useRef<number | null>(null);

  useEffect(() => {
    const refrescar = () => {
      if (espera.current) clearTimeout(espera.current);
      // Varios avisos seguidos (p. ej. a postventa y a Finanzas) = un solo refresco.
      espera.current = setTimeout(() => router.refresh(), 700);
    };
    const alVisibilidad = () => {
      if (document.visibilityState === "hidden") {
        oculta.current = Date.now();
      } else if (oculta.current && Date.now() - oculta.current > 30_000) {
        oculta.current = null;
        refrescar();
      }
    };
    window.addEventListener("crm:aviso", refrescar);
    document.addEventListener("visibilitychange", alVisibilidad);
    return () => {
      window.removeEventListener("crm:aviso", refrescar);
      document.removeEventListener("visibilitychange", alVisibilidad);
      if (espera.current) clearTimeout(espera.current);
    };
  }, [router]);

  return null;
}
