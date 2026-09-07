"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { AsistenteChat } from "@/components/crm/asistente-chat";

/**
 * EL ASISTENTE, EMERGENTE.
 *
 * POR QUÉ FLOTANTE Y NO UNA PANTALLA. La primera versión fue una sección del
 * menú y Santos la rechazó por el motivo correcto: en una reunión el gerente
 * está MIRANDO una pantalla —el cierre de la semana, la cartera de alguien— y
 * la pregunta nace de eso. Mandarlo a otra sección le hace perder de vista
 * justo aquello sobre lo que pregunta, y volver después. La burbuja se abre
 * encima, sin moverlo de donde está.
 *
 * DÓNDE VIVE. Montado en el layout, así que está en todas las pantallas del
 * CRM. Solo para gerencia y admin: el layout ni siquiera lo dibuja para los
 * demás, y aunque alguien llegara al endpoint, éste vuelve a comprobar el rol.
 *
 * EN EL CELULAR ocupa la pantalla entera. Un panel de 400 px flotando sobre un
 * teléfono no se puede escribir.
 */
export function AsistenteFlotante({ nombre }: { nombre: string }) {
  const [abierto, setAbierto] = useState(false);

  // Escape cierra. Es lo que la mano ya hace sin pensarlo.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  return (
    <>
      {/* El botón. No desaparece al abrir: se vuelve el modo de cerrar, así que
          la burbuja siempre se apaga desde donde se prendió. */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? "Cerrar el asistente" : "Abrir el asistente"}
        aria-expanded={abierto}
        className="fixed bottom-5 right-5 z-50 flex size-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 print:hidden"
      >
        <Sparkles className="size-5" />
      </button>

      {abierto && (
        <>
          {/* En el celular la burbuja tapa todo, y hace falta algo que la
              cierre al tocar fuera. En escritorio no: molesta poder apagar el
              chat por un clic distraído en la pantalla que se está mirando. */}
          <div
            className="fixed inset-0 z-40 bg-black/30 sm:hidden"
            onClick={() => setAbierto(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-3 z-50 sm:inset-auto sm:bottom-20 sm:right-5 sm:h-[min(620px,calc(100vh-7rem))] sm:w-[420px]">
            <AsistenteChat
              nombre={nombre}
              onCerrar={() => setAbierto(false)}
              claseContenedor="animar-burbuja h-full w-full rounded-xl border border-border shadow-2xl"
            />
          </div>
          <style>{`
            @keyframes burbuja { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
            .animar-burbuja { animation: burbuja .18s ease-out both; transform-origin: bottom right; }
            @media (prefers-reduced-motion: reduce) { .animar-burbuja { animation: none; } }
          `}</style>
        </>
      )}
    </>
  );
}
