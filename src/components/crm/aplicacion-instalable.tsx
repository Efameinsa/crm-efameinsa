"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, MonitorDown } from "lucide-react";
import { registrarServiceWorker } from "@/lib/push-cliente";
import {
  corriendoInstalada,
  esIOS,
  esSafari,
  noInstaladaEnElServidor,
  sinCambios,
  suscribirModoAplicacion,
} from "@/lib/modo-aplicacion";
import { Button } from "@/components/ui/button";

/**
 * Instalar el CRM como aplicación de escritorio.
 *
 * Santos, 31-08-2026: «PWA, simulando una aplicación de escritorio» — que se
 * abra con su ícono, en su ventana, sin barra de direcciones, y que se pueda
 * anclar a la barra de tareas. Y sobre todo: que LLEGUEN LAS NOTIFICACIONES,
 * que es el motivo original del pedido (viene del 25-08).
 *
 * Este componente hace tres cosas, todas chicas:
 *
 * 1. REGISTRA EL SERVICE WORKER AL ENTRAR. Hasta hoy `/sw.js` solo se
 *    registraba cuando alguien pulsaba «Activar notificaciones», y eso tenía
 *    dos consecuencias: el navegador nunca consideraba instalable el CRM (Chrome
 *    exige un service worker con manejador de `fetch`), y el push dependía de un
 *    clic que Central tardó semanas en dar. Ahora se registra siempre, al
 *    cargar cualquier pantalla. Por eso este componente tiene que estar montado
 *    aunque no dibuje nada.
 *
 * 2. MARCA CUÁNDO CORRE INSTALADA (`data-modo-app="instalada"` en el <html>),
 *    para que la hoja de estilos pueda aprovechar que no hay barra del
 *    navegador (ver el bloque final de globals.css).
 *
 * 3. OFRECE INSTALARLA, discreto y descartable. No aparece si ya está
 *    instalada, ni si la descartaron hace menos de 30 días.
 */

const CLAVE_DESCARTADO = "efameinsa_instalar_descartado";
const DIAS_DE_SILENCIO = 30;

/** El evento de Chrome/Edge; TypeScript no lo trae en su librería estándar. */
interface EventoInstalacion extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * ¿Lo descartaron hace poco? Devuelve un booleano (valor estable, apto para
 * `useSyncExternalStore`). En el servidor se responde «sí, silenciado» para que
 * el HTML salga sin el aviso: React vuelve a preguntar apenas hidrata.
 */
function estaSilenciado(): boolean {
  try {
    const descartado = Number(localStorage.getItem(CLAVE_DESCARTADO));
    return Boolean(descartado) && Date.now() - descartado < DIAS_DE_SILENCIO * 24 * 3600 * 1000;
  } catch {
    return false; // navegador sin almacenamiento: se ofrece igual
  }
}

function silenciadoEnElServidor(): boolean {
  return true;
}

export function AplicacionInstalable() {
  const instalada = useSyncExternalStore(suscribirModoAplicacion, corriendoInstalada, noInstaladaEnElServidor);
  const silenciado = useSyncExternalStore(sinCambios, estaSilenciado, silenciadoEnElServidor);
  const safari = useSyncExternalStore(sinCambios, esSafari, noInstaladaEnElServidor);

  const [evento, setEvento] = useState<EventoInstalacion | null>(null);
  const [descartadoAhora, setDescartadoAhora] = useState(false);

  // El service worker se registra pase lo que pase: no depende de que el aviso
  // se muestre. Es lo que sostiene el push.
  useEffect(() => {
    void registrarServiceWorker();
  }, []);

  useEffect(() => {
    if (instalada) document.documentElement.dataset.modoApp = "instalada";
    else delete document.documentElement.dataset.modoApp;
  }, [instalada]);

  useEffect(() => {
    if (instalada) return;
    // Chrome y Edge (Windows, el 98 % del uso) avisan cuándo se puede instalar.
    function alPoderInstalar(e: Event) {
      // Sin esto el navegador muestra su propio cartelito, que la gente ignora.
      e.preventDefault();
      setEvento(e as EventoInstalacion);
    }
    window.addEventListener("beforeinstallprompt", alPoderInstalar);
    return () => window.removeEventListener("beforeinstallprompt", alPoderInstalar);
  }, [instalada]);

  function descartar() {
    try {
      localStorage.setItem(CLAVE_DESCARTADO, String(Date.now()));
    } catch {
      /* sin almacenamiento: volverá a salir, mala suerte */
    }
    setDescartadoAhora(true);
    setEvento(null);
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    // El evento se consume: aceptado o no, no sirve una segunda vez.
    setEvento(null);
    if (outcome === "dismissed") descartar();
  }

  if (instalada || silenciado || descartadoAhora) return null;
  if (!evento && !safari) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-4 py-3 text-sm">
      <MonitorDown aria-hidden className="size-5 shrink-0 text-primary" />
      <p className="flex-1 text-foreground">
        <strong>Instale el CRM como aplicación.</strong>{" "}
        <span className="text-muted-foreground">
          {evento
            ? "Se abre en su propia ventana, se ancla a la barra de tareas y recibe los avisos aunque el navegador esté cerrado."
            : esIOS()
              ? "Toque «Compartir» y luego «Añadir a pantalla de inicio». En iPhone los avisos solo llegan con la aplicación instalada."
              : "En Safari: menú «Archivo» → «Añadir al Dock». Así se abre en su propia ventana y recibe los avisos."}
        </span>
      </p>
      {evento ? (
        <Button size="sm" onClick={instalar}>
          <Download aria-hidden className="size-4" />
          Instalar
        </Button>
      ) : null}
      <button
        type="button"
        onClick={descartar}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Descartar"
      >
        ✕
      </button>
    </div>
  );
}
