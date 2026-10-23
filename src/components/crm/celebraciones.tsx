"use client";

import { useEffect, useRef } from "react";
import { EVENTO_CELEBRAR, type Celebracion } from "@/lib/celebrar";

/**
 * EL QUE DIBUJA LA CELEBRACIÓN (Santos, 23-10-2026). Escucha el timbre de
 * `lib/celebrar.ts` y reproduce, una sola vez y sin bloquear nada, la animación
 * que toca:
 *
 *  · «paso»: la «e» del isotipo cruza por arriba de la pantalla dejando una
 *    estela y estampa un sello granate (2,4 s). Es para cada paso de un estado
 *    a otro: aprobar, despachar, probar, confirmar el abono, cerrar una etapa…
 *  · «cierre»: Efamein sale al centro de la pantalla con confeti (2,3 s). Solo
 *    al cerrar un caso o un pedido.
 *
 * Las animaciones son Lottie hechas en EffectCraft (`public/animaciones/`),
 * vectoriales y con fondo transparente; el reproductor (lottie_light, solo
 * SVG) se carga recién la primera vez que hace falta, así que una pantalla que
 * no celebra no paga nada.
 *
 * Reglas para que no canse:
 *  · Un «paso» no se repite antes de 4 s (el kit de un pedido se marca de a
 *    varias fotos seguidas).
 *  · Si llegan dos timbres en la misma acción, gana el «cierre».
 *  · Quien tiene «reducir movimiento» en su equipo no ve nada, y una pestaña
 *    en segundo plano tampoco dibuja.
 */
const ARCHIVO: Record<Celebracion, string> = {
  paso: "/animaciones/celebracion-paso.json",
  cierre: "/animaciones/celebracion-cierre.json",
};
const PRIORIDAD: Record<Celebracion, number> = { paso: 1, cierre: 2 };
const PAUSA_ENTRE_PASOS_MS = 4000;

type Reproductor = { destroy(): void; addEventListener(nombre: string, fn: () => void): void };

export function Celebraciones() {
  const cajaPaso = useRef<HTMLDivElement>(null);
  const cajaCierre = useRef<HTMLDivElement>(null);
  const tocando = useRef<{ tipo: Celebracion; anim: Reproductor } | null>(null);
  const pendiente = useRef<Celebracion | null>(null);
  const temporizador = useRef<number | null>(null);
  const ultimoPaso = useRef(0);

  useEffect(() => {
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)");

    async function tocar(tipo: Celebracion) {
      if (quieto.matches || document.hidden) return;
      if (tocando.current) {
        if (PRIORIDAD[tocando.current.tipo] >= PRIORIDAD[tipo]) return;
        tocando.current.anim.destroy();
        tocando.current = null;
      }
      if (tipo === "paso") {
        const ahora = Date.now();
        if (ahora - ultimoPaso.current < PAUSA_ENTRE_PASOS_MS) return;
        ultimoPaso.current = ahora;
      }
      const caja = (tipo === "paso" ? cajaPaso : cajaCierre).current;
      if (!caja) return;
      const lottie = (await import("lottie-web/build/player/lottie_light")).default;
      cajaPaso.current?.replaceChildren();
      cajaCierre.current?.replaceChildren();
      const anim = lottie.loadAnimation({
        container: caja,
        renderer: "svg",
        loop: false,
        autoplay: true,
        path: ARCHIVO[tipo],
        // El paso se ve entero (cabe en la franja); el cierre llena la pantalla.
        rendererSettings: { preserveAspectRatio: tipo === "paso" ? "xMidYMid meet" : "xMidYMid slice" },
      });
      tocando.current = { tipo, anim };
      const fin = () => {
        anim.destroy();
        caja.replaceChildren();
        if (tocando.current?.anim === anim) tocando.current = null;
      };
      anim.addEventListener("complete", fin);
      anim.addEventListener("data_failed", fin);
    }

    // Dos timbres en la misma acción (un «paso» y un «cierre» del mismo botón)
    // se juntan en 120 ms y gana el de más peso.
    const escuchar = (e: Event) => {
      const tipo = (e as CustomEvent<Celebracion>).detail;
      if (!pendiente.current || PRIORIDAD[tipo] > PRIORIDAD[pendiente.current]) pendiente.current = tipo;
      if (temporizador.current) window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(() => {
        const t = pendiente.current;
        pendiente.current = null;
        temporizador.current = null;
        if (t) void tocar(t);
      }, 120);
    };
    window.addEventListener(EVENTO_CELEBRAR, escuchar);
    return () => {
      window.removeEventListener(EVENTO_CELEBRAR, escuchar);
      if (temporizador.current) window.clearTimeout(temporizador.current);
      tocando.current?.anim.destroy();
      tocando.current = null;
    };
  }, []);

  return (
    <>
      <div ref={cajaPaso} aria-hidden className="pointer-events-none fixed inset-x-0 top-2 z-[70] h-[110px] sm:h-[150px]" />
      <div ref={cajaCierre} aria-hidden className="pointer-events-none fixed inset-0 z-[70]" />
    </>
  );
}
