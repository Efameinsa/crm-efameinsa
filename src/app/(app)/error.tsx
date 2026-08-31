"use client";

import { useEffect, useState } from "react";

/**
 * La red de seguridad de las pantallas del CRM.
 *
 * POR QUÉ EXISTE. El 31-08 Katerine reportó «This page couldn't load, reload to
 * try again» y Ariana, «se cae la página del CRM a cada rato, la saca». Ninguna
 * de las dos estaba perdiendo la sesión: la causa fue el DESFASE DE VERSIONES.
 *
 * Cada vez que se despliega, Vercel reemplaza los archivos de JavaScript de la
 * aplicación con los de la versión nueva. Quien tenía el CRM abierto sigue con
 * la versión vieja cargada en su navegador, y en el siguiente clic pide un
 * archivo que ya no existe. Ese pedido falla y la pantalla se rompe. Ese día se
 * desplegó ocho veces entre las 11:39 y las 14:03.
 *
 * Vercel resuelve esto de raíz con «Skew Protection», que mantiene vivos los
 * archivos de la versión anterior — pero es una función de plan Pro y la cuenta
 * de la empresa es gratuita. Sin eso, la manera honesta de arreglarlo es que el
 * CRM se dé cuenta y se recupere solo, que es lo que hace este archivo.
 *
 * CÓMO SE COMPORTA. Si el error es de archivo faltante —el caso del despliegue—
 * recarga sola una vez, y para el usuario es un parpadeo en lugar de una
 * pantalla rota. Recarga UNA sola vez y lo anota en la sesión del navegador,
 * porque una recarga automática en bucle es peor que el error original: deja a
 * la persona sin poder leer siquiera lo que pasó.
 *
 * Cualquier otro error muestra una pantalla que dice qué hacer, sin jerga y sin
 * pedir disculpas: reintentar, o volver al inicio.
 */

const MARCA_RECARGA = "crm:recarga-por-version";

/** Los errores que deja un archivo de la versión anterior que ya no está. */
function esDesfaseDeVersion(e: Error): boolean {
  const texto = `${e.name} ${e.message}`.toLowerCase();
  return (
    texto.includes("chunkloaderror") ||
    texto.includes("loading chunk") ||
    texto.includes("loading css chunk") ||
    texto.includes("failed to fetch dynamically imported module") ||
    texto.includes("importing a module script failed") ||
    texto.includes("error loading dynamically imported module")
  );
}

/** ¿Ya se recargó por esta causa en esta pestaña? Se pregunta y se marca a la
 *  vez, porque la respuesta decide QUÉ se pinta, no solo qué se hace después. */
function tomarElIntento(): boolean {
  try {
    if (sessionStorage.getItem(MARCA_RECARGA) === "1") return false;
    sessionStorage.setItem(MARCA_RECARGA, "1");
    return true;
  } catch {
    // Navegador con el almacenamiento bloqueado: se recarga igual, una vez.
    return true;
  }
}

export default function ErrorDePantalla({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Se decide en el primer render y no en un efecto: así la pantalla que se
  // muestra mientras el navegador recarga es la correcta desde el principio.
  const [recargando] = useState(() => esDesfaseDeVersion(error) && tomarElIntento());

  useEffect(() => {
    if (recargando) window.location.reload();
  }, [recargando]);

  // Cuando la pantalla carga bien, se limpia la marca para que la próxima vez
  // vuelva a tener su recarga disponible.
  useEffect(() => {
    return () => {
      try {
        sessionStorage.removeItem(MARCA_RECARGA);
      } catch {
        /* sin almacenamiento, no hay nada que limpiar */
      }
    };
  }, []);

  if (recargando) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-medium text-foreground">Actualizando a la versión nueva…</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          El CRM se actualizó mientras usted lo tenía abierto. Un segundo y sigue donde estaba.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-lg font-bold text-foreground">Esta pantalla no se pudo abrir</h1>
        <p className="text-sm text-muted-foreground">
          No se perdió nada de lo que ya estaba guardado. Vuelva a intentarlo; si sigue pasando,
          avísele a Santos con la hora y qué estaba haciendo.
        </p>
        {error.digest && (
          <p className="font-mono text-[11px] text-muted-foreground">Referencia: {error.digest}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="cursor-pointer rounded-md bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground hover:brightness-110"
        >
          Volver a intentar
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="cursor-pointer rounded-md border border-border px-3.5 py-2 text-xs font-medium hover:bg-accent"
        >
          Recargar la página
        </button>
      </div>
    </div>
  );
}
