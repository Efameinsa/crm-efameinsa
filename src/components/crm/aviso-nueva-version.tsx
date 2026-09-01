"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * La pastilla «Hay una versión nueva» (Santos, 31-08: «me preocupa que
 * tengamos que presionar Ctrl+Shift+R… crea en algún lugar estratégico un
 * botón de actualizar»).
 *
 * Las decisiones de UX, explícitas:
 * · Solo EXISTE cuando hay versión nueva — el 99,9 % del tiempo no dibuja
 *   nada. Un botón de actualizar permanente sería ruido que se aprende a
 *   ignorar.
 * · Flotante abajo a la IZQUIERDA: visible en toda pantalla y con cualquier
 *   scroll, y sin pelearse con los toasts, que viven a la derecha.
 * · JAMÁS recarga sola: la gente cotiza y escribe formularios largos, y una
 *   recarga sorpresa se los come. El clic es de la persona. (La red de
 *   emergencia para el chunk roto ya existe en error.tsx y esa sí recarga,
 *   porque ahí ya no hay nada que perder.)
 * · Detección: la pestaña nace sabiendo su versión (el commit del despliegue,
 *   embebido por el servidor al renderizar) y pregunta a /api/version cada 5
 *   minutos y al volver el foco — el momento típico de «dejé la pestaña
 *   abierta desde ayer».
 */
export function AvisoNuevaVersion({ versionInicial }: { versionInicial: string }) {
  const [hayNueva, setHayNueva] = useState(false);

  useEffect(() => {
    if (versionInicial === "dev") return; // el dev server ya recarga solo
    let viva = true;
    const revisar = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { version } = (await r.json()) as { version: string };
        if (viva && version && version !== "dev" && version !== versionInicial) setHayNueva(true);
      } catch {
        /* sin red: la pastilla de versión no es quien lo anuncia */
      }
    };
    const alVolver = () => {
      if (document.visibilityState === "visible") void revisar();
    };
    const cada = setInterval(revisar, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      viva = false;
      clearInterval(cada);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [versionInicial]);

  if (!hayNueva) return null;

  return (
    <button
      type="button"
      onClick={() => location.reload()}
      className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-2 rounded-full bg-[#7E1210] px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.03]"
    >
      <RefreshCw className="size-4" />
      Hay una versión nueva — Actualizar
    </button>
  );
}
