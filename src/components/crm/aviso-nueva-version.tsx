"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { esDesfaseDeVersion } from "@/lib/desfase-de-version";
import { haySinGuardar } from "@/lib/sin-guardar";

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
 * · 29-09, CRM en la PC local: pregunta cada minuto (la respuesta es local y
 *   mínima) y, si un botón falla porque el servidor ya no reconoce la acción
 *   de la versión vieja («Failed to find Server Action»), la pastilla sale en
 *   el acto. A Katerine el informe de cierre le dio error un minuto después
 *   de una actualización, y nada le dijo que recargara.
 * · 30-09 (Santos): «que el aviso diga que guardes los cambios primero». La
 *   pastilla lo dice en su texto y, si la pantalla tiene algo escrito sin
 *   guardar (lib/sin-guardar), pregunta antes de recargar. El formulario del
 *   cierre además guarda lo escrito en el navegador y lo ofrece al volver.
 * · 16-10 (análisis del buzón): 60 de 149 respuestas fueron «recargue la
 *   página»; varias personas reportaron algo que ya estaba arreglado porque
 *   su pestaña seguía en la versión vieja. Ahora SE ACTUALIZA SOLA, pero solo
 *   cuando no hay nada que perder: nadie escribió nada en esta pantalla desde
 *   que se abrió, no hay una ventana abierta ni cambios sin guardar, y la
 *   pestaña está en segundo plano o lleva 2 minutos quieta. Si escribió algo,
 *   la pastilla sigue esperando su clic como antes.
 */
export function AvisoNuevaVersion({ versionInicial }: { versionInicial: string }) {
  const [hayNueva, setHayNueva] = useState(false);
  const pathname = usePathname();
  // ¿Escribió algo en esta pantalla? Se olvida al cambiar de pantalla: lo que
  // quedó escrito en la anterior ya se perdió al salir.
  const escribio = useRef(false);
  const ultimoMovimiento = useRef(Date.now());
  useEffect(() => {
    escribio.current = false;
  }, [pathname]);
  useEffect(() => {
    const alEscribir = () => {
      escribio.current = true;
    };
    const alMoverse = () => {
      ultimoMovimiento.current = Date.now();
    };
    document.addEventListener("input", alEscribir, true);
    for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) document.addEventListener(ev, alMoverse, { passive: true, capture: true });
    return () => {
      document.removeEventListener("input", alEscribir, true);
      for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) document.removeEventListener(ev, alMoverse, true);
    };
  }, []);

  // La actualización sola, solo sin nada que perder.
  useEffect(() => {
    if (!hayNueva) return;
    const sinNadaQuePerder = () =>
      !escribio.current &&
      !haySinGuardar() &&
      document.querySelector('[role="dialog"], [role="alertdialog"]') === null;
    const intentar = () => {
      if (!sinNadaQuePerder()) return;
      const quieta = Date.now() - ultimoMovimiento.current > 2 * 60 * 1000;
      if (document.visibilityState === "hidden" || quieta) location.reload();
    };
    intentar();
    const cada = setInterval(intentar, 15 * 1000);
    document.addEventListener("visibilitychange", intentar);
    return () => {
      clearInterval(cada);
      document.removeEventListener("visibilitychange", intentar);
    };
  }, [hayNueva]);

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
    const cada = setInterval(revisar, 60 * 1000);
    document.addEventListener("visibilitychange", alVolver);
    const alFallar = (e: PromiseRejectionEvent | ErrorEvent) => {
      const causa = "reason" in e ? e.reason : (e.error ?? { message: e.message });
      if (esDesfaseDeVersion(causa)) setHayNueva(true);
    };
    window.addEventListener("unhandledrejection", alFallar);
    window.addEventListener("error", alFallar);
    return () => {
      viva = false;
      clearInterval(cada);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("unhandledrejection", alFallar);
      window.removeEventListener("error", alFallar);
    };
  }, [versionInicial]);

  if (!hayNueva) return null;

  function actualizar() {
    if (
      haySinGuardar() &&
      !confirm(
        "Tiene cambios sin guardar en esta pantalla.\n\nPulse «Cancelar», guarde primero y después actualice.\n\n¿Actualizar igual ahora?",
      )
    ) {
      return;
    }
    location.reload();
  }

  return (
    <button
      type="button"
      onClick={actualizar}
      className="fixed bottom-20 left-4 z-50 inline-flex md:bottom-4 items-center gap-2.5 rounded-2xl bg-[#7E1210] px-4 py-2.5 text-left text-white shadow-lg transition-transform hover:scale-[1.03]"
    >
      <RefreshCw className="size-4 flex-none" />
      <span className="leading-tight">
        <span className="block text-sm font-bold">Hay una versión nueva del CRM</span>
        <span className="block text-xs font-medium text-white/85">Guarde lo que está haciendo y luego pulse aquí</span>
      </span>
    </button>
  );
}
