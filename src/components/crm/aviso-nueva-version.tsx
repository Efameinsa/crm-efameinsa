"use client";

import { useEffect, useState } from "react";
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
 *   página»; varias personas reportaron algo ya arreglado porque su pestaña
 *   seguía en la versión vieja. Se probó que recargara sola si la pantalla
 *   estaba quieta 2 minutos.
 * · 17-10 (Santos): «¿recuerdas que por actualizarse solo se perdía lo que el
 *   usuario estaba haciendo? y generaba incomodidad». Tenía razón: «quieta» no
 *   es «sin nada que perder» —un filtro elegido, un renglón agregado con
 *   clics, alguien leyendo la ficha mientras habla por teléfono—. VUELVE la
 *   regla de siempre: la pantalla que se está usando JAMÁS se recarga sola.
 *   Lo que cambia: con versión nueva, el siguiente clic en un enlace del menú
 *   o de la página abre la otra pantalla ya actualizada (carga completa en vez
 *   de la navegación interna). Al salir de una pantalla no hay nada que
 *   perder en ella, y así nadie se queda días en la versión vieja. Si la
 *   pantalla tiene algo escrito sin guardar, el enlace se comporta como
 *   siempre y la pastilla espera su clic.
 */
export function AvisoNuevaVersion({ versionInicial }: { versionInicial: string }) {
  const [hayNueva, setHayNueva] = useState(false);
  const pathname = usePathname();
  // Con versión nueva, salir de la pantalla ya es el momento de actualizar:
  // el enlace abre la otra pantalla con carga completa (ver arriba, 17-10).
  useEffect(() => {
    if (!hayNueva) return;
    const alClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enlace = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!enlace || enlace.target === "_blank" || enlace.hasAttribute("download")) return;
      const destino = new URL(enlace.href, location.href);
      if (destino.origin !== location.origin) return;
      if (destino.pathname === location.pathname && destino.search === location.search) return;
      if (haySinGuardar()) return;
      e.preventDefault();
      e.stopPropagation();
      location.assign(destino.href);
    };
    // «Atrás» del navegador hacia OTRA pantalla: esta ya se dejó, se carga
    // entera. Si solo cambia un filtro de la misma pantalla, no.
    const alVolverAtras = () => {
      if (location.pathname !== pathname) location.reload();
    };
    document.addEventListener("click", alClic, true);
    window.addEventListener("popstate", alVolverAtras);
    return () => {
      document.removeEventListener("click", alClic, true);
      window.removeEventListener("popstate", alVolverAtras);
    };
  }, [hayNueva, pathname]);

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
