"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { AsistenteChat } from "@/components/crm/asistente-chat";
import { cn } from "@/lib/utils";

/**
 * EL ASISTENTE EFAMEIN, EMERGENTE.
 *
 * POR QUÉ FLOTANTE Y NO UNA PANTALLA. La primera versión fue una sección del
 * menú y Santos la rechazó por el motivo correcto: en una reunión el gerente
 * está MIRANDO una pantalla —el cierre de la semana, la cartera de alguien— y
 * la pregunta nace de eso. La burbuja se abre encima, sin moverlo de donde está.
 *
 * DÓNDE VIVE. Montado en el layout, así que está en todas las pantallas del
 * CRM. Desde el 14-10 lo ve todo el personal; lo que cada uno puede saber lo
 * decide el servidor con los permisos de su cuenta (lib/asistente/permisos.ts).
 *
 * DOS TAMAÑOS (Santos, 14-10: «es pequeña, debe poder maximizarse… a veces hay
 * mucha información»). La mayoría trabaja en pantallas HD (1366×768) y algunos
 * en Full HD:
 *   · normal: 440 px de ancho a la derecha, alto hasta 680 px. Deja ver la
 *     pantalla de atrás, que es de donde nace la pregunta.
 *   · grande: casi toda la pantalla (hasta 1100 px de ancho), con el texto en
 *     una columna de lectura cómoda y las tablas con aire. Un velo detrás; al
 *     tocarlo, o con Escape, vuelve al tamaño normal (no se cierra: se perdería
 *     la conversación de vista).
 * El tamaño elegido se recuerda en este navegador.
 *
 * EN EL CELULAR ocupa la pantalla entera siempre; el botón de agrandar no se
 * muestra porque no hay más que agrandar.
 */
const CLAVE_TAMANO = "crm:asistente-grande";

export function AsistenteFlotante({ nombre, sugerencias }: { nombre: string; sugerencias?: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const [grande, setGrande] = useState(false);

  // El tamaño recordado se lee al abrir, no al montar: así no hay un render
  // de más en cada pantalla del CRM para algo que todavía nadie abrió.
  function abrirOCerrar() {
    if (!abierto) {
      try {
        setGrande(localStorage.getItem(CLAVE_TAMANO) === "1");
      } catch {
        // Sin almacenamiento (ventana privada): arranca en normal.
      }
    }
    setAbierto((v) => !v);
  }

  function alternarTamano() {
    setGrande((g) => {
      try {
        localStorage.setItem(CLAVE_TAMANO, g ? "0" : "1");
      } catch {
        // No pasa nada: solo no se recuerda.
      }
      return !g;
    });
  }

  // Escape: si está grande, vuelve a normal; si no, cierra.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (grande) alternarTamano();
      else setAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto, grande]);

  return (
    <>
      {/* El botón. Se vuelve el modo de cerrar; agrandado, la ventana lo tapa
          y se cierra desde su propia cabecera. */}
      <button
        type="button"
        onClick={abrirOCerrar}
        aria-label={abierto ? "Cerrar el Asistente Efamein" : "Abrir el Asistente Efamein"}
        title="Asistente Efamein"
        aria-expanded={abierto}
        className={cn(
          "fixed bottom-20 right-4 z-50 flex size-13 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-lg shadow-primary/25 ring-4 ring-primary/10 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-primary/40 md:bottom-5 md:right-5 print:hidden",
          abierto && grande && "sm:hidden",
        )}
      >
        <Sparkles className="size-5" />
      </button>

      {abierto && (
        <>
          {/* El velo: en el celular siempre (cierra); en escritorio solo
              agrandado (vuelve a normal). En normal no hay velo: molesta
              perder el chat por un clic distraído en la pantalla de atrás. */}
          <div
            className={cn("animar-velo fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]", grande ? "" : "sm:hidden")}
            onClick={() => (grande ? alternarTamano() : setAbierto(false))}
            aria-hidden="true"
          />
          <div
            className={cn(
              "fixed inset-3 z-50 transition-[width,height,top,right,bottom] duration-200 ease-out",
              grande
                ? "sm:inset-auto sm:bottom-4 sm:right-4 sm:top-4 sm:w-[min(1100px,calc(100vw-2rem))]"
                : "sm:inset-auto sm:bottom-20 sm:right-5 sm:h-[min(680px,calc(100vh-7rem))] sm:w-[440px]",
            )}
          >
            <AsistenteChat
              nombre={nombre}
              sugerencias={sugerencias}
              grande={grande}
              onAlternarTamano={alternarTamano}
              onCerrar={() => setAbierto(false)}
              claseContenedor="animar-burbuja h-full w-full rounded-2xl border border-border/80 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35),0_2px_6px_rgba(15,23,42,0.06)]"
            />
          </div>
          <style>{`
            @keyframes burbuja { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
            .animar-burbuja { animation: burbuja .18s ease-out both; transform-origin: bottom right; }
            @keyframes velo { from { opacity: 0; } to { opacity: 1; } }
            .animar-velo { animation: velo .18s ease-out both; }
            @media (prefers-reduced-motion: reduce) { .animar-burbuja, .animar-velo { animation: none; } }
          `}</style>
        </>
      )}
    </>
  );
}
