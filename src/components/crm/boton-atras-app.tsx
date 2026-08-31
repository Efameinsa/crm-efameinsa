"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { corriendoInstalada, noInstaladaEnElServidor, suscribirModoAplicacion } from "@/lib/modo-aplicacion";
import { Button } from "@/components/ui/button";

/**
 * La flecha «atrás», SOLO cuando el CRM corre instalado.
 *
 * Es la contrapartida de lo que ganamos: la ventana de la aplicación instalada
 * no tiene barra del navegador —eso es justo lo que Santos quería, «que parezca
 * una aplicación de escritorio», 31-08-2026— pero tampoco tiene el botón de
 * volver. En Chrome instalado hay que ir al menú de tres puntos o acordarse de
 * Alt+Flecha izquierda, y acá se navega todo el día de la cartera a la ficha y
 * de la ficha a la cotización.
 *
 * En el navegador normal NO se dibuja: ahí la flecha ya está y duplicarla solo
 * confunde.
 */
export function BotonAtrasApp() {
  const router = useRouter();
  const instalada = useSyncExternalStore(suscribirModoAplicacion, corriendoInstalada, noInstaladaEnElServidor);

  if (!instalada) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => router.back()}
      aria-label="Volver a la pantalla anterior"
      title="Volver"
    >
      <ArrowLeft aria-hidden className="size-4" />
    </Button>
  );
}
