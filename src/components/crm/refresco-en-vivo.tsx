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
 *
 * 07-10 (buzón de Ariana: «estoy en una ventana llenando los datos y de
 * repente se cierra todo»). Ese «no se pierde» deja de ser cierto después de
 * un despliegue: si el servidor ya corre otra versión, Next no trae datos sino
 * que RECARGA la página entera, y la ventana abierta se va con lo escrito. A
 * ella le llegó un aviso de WhatsApp minutos después del despliegue de las
 * 09:23. Ahora, antes de refrescar se mira /api/version: si hay versión nueva
 * no se refresca (la pastilla «Hay una versión nueva» invita a guardar y
 * actualizar). Y con una ventana abierta tampoco: se refresca al cerrarla.
 */
export function RefrescoEnVivo({ versionInicial }: { versionInicial: string }) {
  const router = useRouter();
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oculta = useRef<number | null>(null);
  const pendiente = useRef(false);

  useEffect(() => {
    const hayVentanaAbierta = () => document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
    const hayVersionNueva = async () => {
      if (versionInicial === "dev") return false;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return true; // sin saber, mejor no arriesgar la recarga
        const { version } = (await r.json()) as { version: string };
        return Boolean(version) && version !== "dev" && version !== versionInicial;
      } catch {
        return true;
      }
    };
    const refrescarYa = async () => {
      if (hayVentanaAbierta()) {
        pendiente.current = true;
        return;
      }
      if (await hayVersionNueva()) return;
      pendiente.current = false;
      router.refresh();
    };
    const refrescar = () => {
      if (espera.current) clearTimeout(espera.current);
      // Varios avisos seguidos (p. ej. a postventa y a Finanzas) = un solo refresco.
      espera.current = setTimeout(() => void refrescarYa(), 700);
    };
    const alVisibilidad = () => {
      if (document.visibilityState === "hidden") {
        oculta.current = Date.now();
      } else if (oculta.current && Date.now() - oculta.current > 30_000) {
        oculta.current = null;
        refrescar();
      }
    };
    // El refresco que quedó esperando a que se cierre la ventana.
    const observador = new MutationObserver(() => {
      if (pendiente.current && !hayVentanaAbierta()) refrescar();
    });
    observador.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("crm:aviso", refrescar);
    document.addEventListener("visibilitychange", alVisibilidad);
    return () => {
      observador.disconnect();
      window.removeEventListener("crm:aviso", refrescar);
      document.removeEventListener("visibilitychange", alVisibilidad);
      if (espera.current) clearTimeout(espera.current);
    };
  }, [router, versionInicial]);

  return null;
}
