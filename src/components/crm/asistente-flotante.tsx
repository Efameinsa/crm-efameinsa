"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as EventoPuntero } from "react";
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
 *   · normal: 440 px de ancho, alto hasta 680 px. Deja ver la pantalla de
 *     atrás, que es de donde nace la pregunta.
 *   · grande: casi toda la pantalla (hasta 1100 px de ancho), con el texto en
 *     una columna de lectura cómoda y las tablas con aire. Un velo detrás; al
 *     tocarlo, o con Escape, vuelve al tamaño normal (no se cierra: se perdería
 *     la conversación de vista).
 * El tamaño elegido se recuerda en este navegador.
 *
 * EN EL CELULAR ocupa la pantalla entera siempre; el botón de agrandar no se
 * muestra porque no hay más que agrandar.
 *
 * LA BOLITA SE MUEVE (Santos, 14-10: «puede arrastrarse y moverse pero con
 * animación orgánica para que cada usuario pueda acomodarlo»). Fija abajo a la
 * derecha tapaba botones de algunas pantallas. Ahora se arrastra a cualquier
 * parte: la sigue con un resorte (se queda un pelo atrás y se estira hacia
 * donde va, como una gota); al soltarla conserva el impulso y se asienta con
 * un pequeño rebote. Un toque sin arrastrar la abre como siempre. El lugar se
 * recuerda en este navegador y por persona, en proporción a la pantalla (así
 * sobrevive a cambiar el tamaño de la ventana). La ventana del chat se abre
 * junto a la bolita, del lado donde hay espacio.
 */
const CLAVE_TAMANO = "crm:asistente-grande";
const claveLugar = (nombre: string) => `crm:asistente-lugar:${nombre}`;
/** Diámetro de la bolita (size-13) y su margen mínimo a los bordes. */
const LADO = 52;
const MARGEN = 12;
/** Cuánto hay que mover el dedo o el ratón para que sea arrastre y no toque. */
const UMBRAL_ARRASTRE = 6;

type Punto = { x: number; y: number };

const acotar = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

function dentroDeLaPantalla(p: Punto): Punto {
  return {
    x: acotar(p.x, MARGEN, window.innerWidth - LADO - MARGEN),
    y: acotar(p.y, MARGEN, window.innerHeight - LADO - MARGEN),
  };
}

/**
 * Dónde va la ventana del chat (tamaño normal, escritorio) según la bolita:
 * encima o debajo si cabe con buen alto; si la bolita está a media altura, al
 * costado. Siempre dentro de la pantalla.
 */
function lugarDeLaVentana(b: Punto, vw: number, vh: number): CSSProperties {
  const ANCHO = 440, ALTO_MAX = 680, SEP = 10, M = 16;
  const aLaDerecha = b.x + LADO / 2 > vw / 2;
  const libreArriba = b.y - SEP - M;
  const libreAbajo = vh - (b.y + LADO) - SEP - M;
  const arriba = libreArriba >= libreAbajo;
  const libre = Math.max(libreArriba, libreAbajo);
  if (libre >= 420) {
    const alto = Math.min(ALTO_MAX, libre);
    return {
      width: ANCHO,
      height: alto,
      left: acotar(aLaDerecha ? b.x + LADO - ANCHO : b.x, M, vw - M - ANCHO),
      top: arriba ? b.y - SEP - alto : b.y + LADO + SEP,
      ["--origen" as string]: `${arriba ? "bottom" : "top"} ${aLaDerecha ? "right" : "left"}`,
    };
  }
  const alto = Math.min(ALTO_MAX, vh - 2 * M);
  return {
    width: ANCHO,
    height: alto,
    left: acotar(aLaDerecha ? b.x - SEP - ANCHO : b.x + LADO + SEP, M, vw - M - ANCHO),
    top: acotar(b.y + LADO / 2 - alto / 2, M, vh - M - alto),
    ["--origen" as string]: `center ${aLaDerecha ? "right" : "left"}`,
  };
}

export function AsistenteFlotante({ nombre, sugerencias }: { nombre: string; sugerencias?: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const [grande, setGrande] = useState(false);
  // null: nunca la movieron; va en su esquina de siempre, puesta con clases.
  const [lugar, setLugar] = useState<Punto | null>(null);
  const [pantalla, setPantalla] = useState({ ancho: 0, alto: 0, escritorio: false });
  const [agarrada, setAgarrada] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);

  // La física vive en refs y mueve el DOM directo: sesenta cuadros por segundo
  // sin un solo render de React.
  const fis = useRef({
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    meta: { x: 0, y: 0 },
    arrastrando: false,
    agarre: { x: 0, y: 0 },
    inicio: { x: 0, y: 0 },
    movio: false,
    cuadro: 0,
    ultimo: 0,
  });
  // Quien pidió menos movimiento al sistema: se mueve igual, sin resorte ni estiro.
  const quieto = useRef(false);

  const pintar = useCallback(() => {
    const el = boton.current;
    if (!el) return;
    const f = fis.current;
    const rapidez = Math.hypot(f.vel.x, f.vel.y);
    // La gota: se estira hacia donde va y se angosta de costado.
    const estiro = quieto.current ? 0 : Math.min(rapidez / 60, 0.22);
    const angulo = Math.atan2(f.vel.y, f.vel.x);
    el.style.transform =
      `translate3d(${f.pos.x}px, ${f.pos.y}px, 0) rotate(${angulo}rad) ` +
      `scale(${1 + estiro}, ${1 - estiro * 0.7}) rotate(${-angulo}rad)`;
  }, []);

  const guardar = useCallback(
    (p: Punto) => {
      try {
        const fx = p.x / Math.max(1, window.innerWidth - LADO);
        const fy = p.y / Math.max(1, window.innerHeight - LADO);
        localStorage.setItem(claveLugar(nombre), JSON.stringify({ fx, fy }));
      } catch {
        // Sin almacenamiento: se mueve igual, solo no se recuerda.
      }
    },
    [nombre],
  );

  const animar = useCallback(() => {
    const f = fis.current;
    cancelAnimationFrame(f.cuadro);
    f.ultimo = 0;
    const paso = (t: number) => {
      const dt = Math.min(2, f.ultimo ? (t - f.ultimo) / 16.67 : 1);
      f.ultimo = t;
      // Arrastrando: resorte firme (la sigue de cerca, con un pelo de atraso).
      // Suelta: resorte blando con poca fricción, para el rebote al asentarse.
      const k = f.arrastrando ? 0.32 : 0.11;
      const amort = f.arrastrando ? 0.58 : 0.74;
      for (const eje of ["x", "y"] as const) {
        f.vel[eje] = (f.vel[eje] + (f.meta[eje] - f.pos[eje]) * k * dt) * Math.pow(amort, dt);
        f.pos[eje] += f.vel[eje] * dt;
      }
      pintar();
      const enReposo =
        !f.arrastrando &&
        Math.abs(f.vel.x) + Math.abs(f.vel.y) < 0.05 &&
        Math.abs(f.meta.x - f.pos.x) + Math.abs(f.meta.y - f.pos.y) < 0.5;
      if (enReposo) {
        f.pos = { ...f.meta };
        f.vel = { x: 0, y: 0 };
        pintar();
        setLugar({ ...f.meta });
        guardar(f.meta);
        return;
      }
      f.cuadro = requestAnimationFrame(paso);
    };
    f.cuadro = requestAnimationFrame(paso);
  }, [guardar, pintar]);

  // Al entrar: el tamaño de la pantalla y, si la movieron antes, su lugar.
  useEffect(() => {
    quieto.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const f = fis.current;
    const medir = () => {
      setPantalla({
        ancho: window.innerWidth,
        alto: window.innerHeight,
        escritorio: window.matchMedia("(min-width: 640px)").matches,
      });
      if (!f.arrastrando && (f.meta.x || f.meta.y)) {
        // La ventana cambió de tamaño: la bolita vuelve a quedar adentro.
        const p = dentroDeLaPantalla(f.meta);
        f.pos = { ...p };
        f.meta = { ...p };
        pintar();
        setLugar((l) => (l ? p : l));
      }
    };
    try {
      const g = JSON.parse(localStorage.getItem(claveLugar(nombre)) ?? "null");
      if (g && typeof g.fx === "number" && typeof g.fy === "number") {
        const p = dentroDeLaPantalla({
          x: g.fx * (window.innerWidth - LADO),
          y: g.fy * (window.innerHeight - LADO),
        });
        f.pos = { ...p };
        f.meta = { ...p };
        setLugar(p);
      }
    } catch {
      // Lugar ilegible: queda en su esquina.
    }
    medir();
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("resize", medir);
      cancelAnimationFrame(f.cuadro);
    };
  }, [nombre, pintar]);

  // Al pasar a posición libre, el primer cuadro se pinta ahí mismo (antes de que se vea, para que no parpadee en la esquina).
  useLayoutEffect(() => {
    if (lugar && !fis.current.arrastrando) pintar();
  }, [lugar, pintar]);

  function alBajar(e: EventoPuntero<HTMLButtonElement>) {
    if (e.button !== 0) return;
    const f = fis.current;
    if (!lugar) {
      // Primera vez: arranca desde donde la dejaron las clases.
      const r = e.currentTarget.getBoundingClientRect();
      f.pos = { x: r.left, y: r.top };
      f.meta = { ...f.pos };
    }
    f.agarre = { x: e.clientX - f.pos.x, y: e.clientY - f.pos.y };
    f.inicio = { x: e.clientX, y: e.clientY };
    f.movio = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    setAgarrada(true);
  }

  function alMover(e: EventoPuntero<HTMLButtonElement>) {
    const f = fis.current;
    if (!agarrada) return;
    if (!f.movio) {
      if (Math.hypot(e.clientX - f.inicio.x, e.clientY - f.inicio.y) < UMBRAL_ARRASTRE) return;
      f.movio = true;
      f.arrastrando = true;
      if (!lugar) setLugar({ ...f.pos });
      if (!quieto.current) animar();
    }
    f.meta = { x: e.clientX - f.agarre.x, y: e.clientY - f.agarre.y };
    if (quieto.current) {
      f.pos = { ...f.meta };
      pintar();
    }
  }

  function alSoltar(e: EventoPuntero<HTMLButtonElement>) {
    const f = fis.current;
    setAgarrada(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!f.movio) return;
    f.arrastrando = false;
    // El impulso: si la lanzan, sigue un poco antes de asentarse.
    f.meta = dentroDeLaPantalla({ x: f.meta.x + f.vel.x * 6, y: f.meta.y + f.vel.y * 6 });
    if (quieto.current) {
      f.pos = { ...f.meta };
      pintar();
      setLugar({ ...f.meta });
      guardar(f.meta);
    } else {
      animar();
    }
  }

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

  const ventanaJuntoALaBolita = !grande && lugar && pantalla.escritorio;

  return (
    <>
      {/* El botón. Se vuelve el modo de cerrar; agrandado, la ventana lo tapa
          y se cierra desde su propia cabecera. Se arrastra a cualquier parte. */}
      <button
        ref={boton}
        type="button"
        onClick={(e) => {
          // Si fue un arrastre, soltarla no la abre.
          if (fis.current.movio) {
            e.preventDefault();
            fis.current.movio = false;
            return;
          }
          abrirOCerrar();
        }}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        aria-label={abierto ? "Cerrar el Asistente Efamein" : "Abrir el Asistente Efamein"}
        title="Asistente Efamein · arrástrelo para ponerlo donde no le estorbe"
        aria-expanded={abierto}
        className={cn(
          "group fixed z-50 size-13 touch-none select-none rounded-full focus-visible:outline-none print:hidden",
          lugar ? "left-0 top-0 will-change-transform" : "bottom-20 right-4 md:bottom-5 md:right-5",
          agarrada ? "cursor-grabbing" : "cursor-grab",
          abierto && grande && "sm:hidden",
        )}
      >
        <span
          className={cn(
            "flex size-full items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-lg shadow-primary/25 ring-4 ring-primary/10 transition-[transform,box-shadow] duration-300 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] group-hover:scale-105 group-focus-visible:ring-primary/40",
            agarrada && "scale-110 shadow-xl shadow-primary/35 group-hover:scale-110",
          )}
        >
          <Sparkles className="size-5" />
        </span>
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
              "fixed inset-3 z-50 transition-[width,height,top,left,right,bottom] duration-200 ease-out",
              grande
                ? "sm:inset-auto sm:bottom-4 sm:right-4 sm:top-4 sm:w-[min(1100px,calc(100vw-2rem))]"
                : ventanaJuntoALaBolita
                  ? "sm:inset-auto"
                  : "sm:inset-auto sm:bottom-20 sm:right-5 sm:h-[min(680px,calc(100vh-7rem))] sm:w-[440px]",
            )}
            // Movida la bolita, la ventana se abre a su lado.
            style={ventanaJuntoALaBolita ? lugarDeLaVentana(lugar, pantalla.ancho, pantalla.alto) : undefined}
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
            .animar-burbuja { animation: burbuja .18s ease-out both; transform-origin: var(--origen, bottom right); }
            @keyframes velo { from { opacity: 0; } to { opacity: 1; } }
            .animar-velo { animation: velo .18s ease-out both; }
            @media (prefers-reduced-motion: reduce) { .animar-burbuja, .animar-velo { animation: none; } }
          `}</style>
        </>
      )}
    </>
  );
}
