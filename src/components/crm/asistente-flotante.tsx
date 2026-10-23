"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as EventoPuntero } from "react";
import { AvatarEfamein } from "@/components/crm/avatar-efamein";
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
 *
 * MINIMIZAR (Santos, 14-10: «si le dan en "x" se cierra y todo empieza de
 * nuevo»). El botón «—» de la cabecera encoge la ventana hacia la bolita sin
 * desmontarla: la conversación, lo escrito y hasta la respuesta en camino
 * siguen ahí. Tocar la bolita la devuelve. Minimizada, la bolita avisa: un
 * anillo que gira mientras Efamein responde, un punto verde que late cuando
 * ya respondió y uno ámbar si la conversación solo está esperando. Por eso
 * la bolita, Escape y el velo del celular ahora minimizan: solo la X termina
 * la conversación.
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
  // Minimizada: la ventana sigue montada (y la conversación viva), solo
  // encogida hacia la bolita. La X es la única que la termina.
  const [minimizado, setMinimizado] = useState(false);
  const [actividad, setActividad] = useState({ mensajes: 0, pensando: false });
  // Llegó una respuesta mientras estaba minimizada: la bolita lo avisa.
  const [novedad, setNovedad] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);

  const minimizadoRef = useRef(false);
  useEffect(() => {
    minimizadoRef.current = minimizado;
  }, [minimizado]);
  const pensabaRef = useRef(false);

  const alCambiarActividad = useCallback((a: { mensajes: number; pensando: boolean }) => {
    if (pensabaRef.current && !a.pensando && a.mensajes > 0 && minimizadoRef.current) setNovedad(true);
    pensabaRef.current = a.pensando;
    setActividad(a);
  }, []);

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
  // EL CHAT DEL CASO LA APARTA (Santos 23-10: «ese chat se estorba con Efamein,
  // cuando se active el chat bota a Efamein a la izquierda»). Guarda de dónde
  // venía (null = la esquina de siempre) para volver cuando el chat se cierra.
  const apartada = useRef<{ desde: Punto | null } | null>(null);
  const volverAEsquina = useRef(false);
  /** De vuelta a la esquina de siempre: sin desplazamiento propio (si no, se sumaría al de las clases y quedaría afuera). */
  const quedarEnLaEsquina = useCallback(() => {
    const f = fis.current;
    f.pos = { x: 0, y: 0 };
    f.meta = { x: 0, y: 0 };
    f.vel = { x: 0, y: 0 };
    if (boton.current) boton.current.style.transform = "";
    setLugar(null);
  }, []);

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
        if (volverAEsquina.current) {
          // Volvió de apartarse y nunca la habían movido: queda otra vez con las clases de la esquina.
          volverAEsquina.current = false;
          quedarEnLaEsquina();
          return;
        }
        setLugar({ ...f.meta });
        // Apartada por el chat del caso: es un lugar de paso, no se recuerda.
        if (!apartada.current) guardar(f.meta);
        return;
      }
      f.cuadro = requestAnimationFrame(paso);
    };
    f.cuadro = requestAnimationFrame(paso);
  }, [guardar, pintar, quedarEnLaEsquina]);

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
        // eslint-disable-next-line react-hooks/set-state-in-effect -- el lugar guardado solo existe en el navegador
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

  // El chat del caso (abajo a la derecha; en el celular, todo el ancho de abajo) la aparta y, al cerrarse, la devuelve.
  useEffect(() => {
    const f = fis.current;
    const esquina = (): Punto => {
      const md = window.matchMedia("(min-width: 768px)").matches;
      return { x: window.innerWidth - LADO - (md ? 20 : 16), y: window.innerHeight - LADO - (md ? 20 : 80) };
    };
    const mover = (meta: Punto) => {
      f.meta = dentroDeLaPantalla(meta);
      if (quieto.current) {
        f.pos = { ...f.meta };
        pintar();
        if (volverAEsquina.current) {
          volverAEsquina.current = false;
          quedarEnLaEsquina();
        } else setLugar({ ...f.meta });
      } else animar();
    };
    const alChat = (ev: Event) => {
      const visible = (ev as CustomEvent<{ visible: boolean }>).detail?.visible === true;
      if (f.arrastrando) return;
      const ahora: Punto | null = f.meta.x || f.meta.y ? { ...f.meta } : null;
      const actual = ahora ?? esquina();
      if (visible && !apartada.current) {
        const escritorio = window.matchMedia("(min-width: 640px)").matches;
        if (escritorio) {
          // Solo si está en la mitad derecha (donde flota el chat): pasa al costado izquierdo, a la misma altura.
          if (actual.x + LADO / 2 < window.innerWidth / 2) return;
          apartada.current = { desde: ahora };
          if (!ahora) {
            f.pos = { ...actual };
            f.meta = { ...actual };
            setLugar({ ...actual });
          }
          mover({ x: MARGEN, y: actual.y });
        } else {
          // En el celular el chat ocupa el ancho de abajo: sube por encima de él, a la izquierda.
          const altoChat = Math.min(544, window.innerHeight - 80);
          apartada.current = { desde: ahora };
          if (!ahora) {
            f.pos = { ...actual };
            f.meta = { ...actual };
            setLugar({ ...actual });
          }
          mover({ x: MARGEN, y: window.innerHeight - altoChat - LADO - 24 });
        }
      } else if (!visible && apartada.current) {
        const { desde } = apartada.current;
        apartada.current = null;
        if (desde) mover(desde);
        else {
          volverAEsquina.current = true;
          mover(esquina());
        }
      }
    };
    window.addEventListener("crm:chat-visible", alChat);
    // Si el chat ya estaba abierto cuando apareció la bolita (cambio de pantalla).
    if ((window as unknown as { __crmChatVisible?: boolean }).__crmChatVisible) {
      alChat(new CustomEvent("crm:chat-visible", { detail: { visible: true } }));
    }
    return () => window.removeEventListener("crm:chat-visible", alChat);
  }, [animar, pintar, quedarEnLaEsquina]);

  // Al pasar a posición libre, el primer cuadro se pinta ahí mismo (antes de que se vea, para que no parpadee en la esquina).
  useLayoutEffect(() => {
    if (lugar && !fis.current.arrastrando) pintar();
  }, [lugar, pintar]);

  function alBajar(e: EventoPuntero<HTMLButtonElement>) {
    if (e.button !== 0) return;
    const f = fis.current;
    // La movió a mano mientras el chat estaba abierto: ese es su lugar ahora, ya no vuelve sola.
    apartada.current = null;
    volverAEsquina.current = false;
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

  // La bolita, con la ventana abierta, ya no la cierra (se perdía la
  // conversación): la minimiza, y minimizada la devuelve.
  function tocarLaBolita() {
    if (!abierto) {
      setMinimizado(false);
      abrirOCerrar();
    } else {
      setMinimizado((m) => !m);
    }
    setNovedad(false);
  }

  function cerrarDelTodo() {
    setAbierto(false);
    setMinimizado(false);
    setNovedad(false);
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

  // Escape: si está grande, vuelve a normal; si no, minimiza (no cierra: un
  // Escape distraído no debe borrar la conversación).
  useEffect(() => {
    if (!abierto || minimizado) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (grande) alternarTamano();
      else setMinimizado(true);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto, grande, minimizado]);

  const ventanaJuntoALaBolita = !grande && lugar && pantalla.escritorio;
  const enEspera = abierto && minimizado;
  // La nube «¿Te ayudo en algo?» sale hacia el lado con más espacio: si la
  // bolita quedó en la mitad izquierda de la pantalla, a su derecha.
  const nubeALaDerecha = Boolean(lugar && pantalla.ancho && lugar.x + LADO / 2 < pantalla.ancho / 2);

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
          tocarLaBolita();
        }}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        aria-label={
          !abierto
            ? "Abrir Efamein"
            : minimizado
              ? "Volver a la conversación con Efamein"
              : "Minimizar Efamein"
        }
        title={
          enEspera
            ? actividad.pensando
              ? "Efamein está respondiendo · toque para ver"
              : novedad
                ? "Efamein ya respondió · toque para ver"
                : "Conversación minimizada · toque para volver"
            : "Efamein · arrástrelo para ponerlo donde no le estorbe"
        }
        aria-expanded={abierto && !minimizado}
        className={cn(
          "group fixed z-50 size-13 touch-none select-none rounded-full focus-visible:outline-none print:hidden",
          lugar ? "left-0 top-0 will-change-transform" : "bottom-20 right-4 md:bottom-5 md:right-5",
          agarrada ? "cursor-grabbing" : "cursor-grab",
          abierto && grande && !minimizado && "sm:hidden",
        )}
      >
        {/* Minimizada y pensando: un anillo que gira alrededor de la bolita. */}
        {enEspera && actividad.pensando && (
          <span className="pointer-events-none absolute -inset-1.5 animate-spin rounded-full border-2 border-primary/60 border-t-transparent [animation-duration:1.1s]" aria-hidden="true" />
        )}
        {/* LA CARA DE EFAMEIN (Santos, 15-10): vidrio rojo oscuro con negro,
            la «e» de EFAMEINSA en blanco, sin el círculo, y una
            sonrisa de vez en cuando. Al lado, una nube que ofrece ayuda. */}
        <span
          className={cn(
            "block size-full rounded-full transition-transform duration-300 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-primary/60 group-focus-visible:rounded-full",
            agarrada && "scale-110 group-hover:scale-110",
          )}
        >
          <AvatarEfamein className="size-full shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-10px_18px_-8px_rgba(0,0,0,0.55),0_10px_24px_-8px_rgba(90,15,13,0.6)]" />
        </span>
        {!abierto && !agarrada && (
          <span
            aria-hidden="true"
            className={cn(
              "nube-efamein pointer-events-none absolute top-1/2 hidden whitespace-nowrap rounded-2xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-md min-[360px]:block",
              nubeALaDerecha ? "left-full ml-2.5" : "right-full mr-2.5",
            )}
          >
            ¿Te ayudo en algo?
            {/* La colita de la nube, hacia la bolita. */}
            <span
              className={cn(
                "absolute top-1/2 size-2.5 -translate-y-1/2 rotate-45 border-border bg-background",
                nubeALaDerecha ? "-left-[5px] border-b border-l" : "-right-[5px] border-r border-t",
              )}
            />
          </span>
        )}
        {/* Minimizada: un punto dice que la conversación sigue ahí; verde y
            latiendo si llegó la respuesta mientras no se veía. */}
        {enEspera && !actividad.pensando && (actividad.mensajes > 0 || novedad) && (
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex size-3.5" aria-hidden="true">
            {novedad && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/70" />}
            <span
              className={cn(
                "relative size-3.5 rounded-full border-2 border-background",
                novedad ? "bg-emerald-500" : "bg-amber-400",
              )}
            />
          </span>
        )}
      </button>
      <style>{`
        .nube-efamein { animation: nube-efamein .35s cubic-bezier(.34,1.56,.64,1) .4s both; transform: translateY(-50%); }
        @keyframes nube-efamein { from { opacity: 0; transform: translateY(-50%) scale(.85); } to { opacity: 1; transform: translateY(-50%) scale(1); } }
        @media (prefers-reduced-motion: reduce) { .nube-efamein { animation: none; } }
      `}</style>

      {abierto && (
        <>
          {/* El velo: en el celular siempre (minimiza); en escritorio solo
              agrandado (vuelve a normal). En normal no hay velo: molesta
              perder el chat por un clic distraído en la pantalla de atrás. */}
          {!minimizado && (
            <div
              className={cn("animar-velo fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]", grande ? "" : "sm:hidden")}
              onClick={() => (grande ? alternarTamano() : setMinimizado(true))}
              aria-hidden="true"
            />
          )}
          {/* Minimizada, la ventana NO se desmonta: se encoge hacia la bolita
              y se vuelve invisible, con la conversación intacta adentro. */}
          <div
            aria-hidden={minimizado || undefined}
            inert={minimizado || undefined}
            className={cn(
              "fixed inset-3 z-50 transition-[width,height,top,left,right,bottom,opacity,transform,visibility] duration-200 ease-out",
              minimizado && "pointer-events-none",
              grande
                ? "sm:inset-auto sm:bottom-4 sm:right-4 sm:top-4 sm:w-[min(1100px,calc(100vw-2rem))]"
                : ventanaJuntoALaBolita
                  ? "sm:inset-auto"
                  : "sm:inset-auto sm:bottom-20 sm:right-5 sm:h-[min(680px,calc(100vh-7rem))] sm:w-[440px]",
            )}
            // Movida la bolita, la ventana se abre a su lado.
            style={{
              ...(ventanaJuntoALaBolita ? lugarDeLaVentana(lugar, pantalla.ancho, pantalla.alto) : {}),
              transformOrigin: "var(--origen, bottom right)",
              ...(minimizado
                ? { opacity: 0, transform: "scale(.25)", visibility: "hidden" as const }
                : { opacity: 1, transform: "none", visibility: "visible" as const }),
            }}
          >
            <AsistenteChat
              nombre={nombre}
              sugerencias={sugerencias}
              grande={grande}
              onAlternarTamano={alternarTamano}
              onMinimizar={() => setMinimizado(true)}
              onActividad={alCambiarActividad}
              onCerrar={cerrarDelTodo}
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
