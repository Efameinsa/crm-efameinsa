"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Trash2, Loader2, ChevronDown, Database, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * El asistente de gerencia, en pantalla.
 *
 * ADAPTADO DEL COMPONENTE QUE TRAJO SANTOS, con dos cambios de fondo:
 *
 * 1. LOS COLORES SON LOS DE LA CASA. El original venía en índigo y pizarra
 *    quemados en el código. Acá todo sale de los tokens del CRM —`primary` es
 *    el granate de la marca, `card`, `border`, `muted`—, así que se ve como el
 *    resto del sistema y funciona igual en tema claro y oscuro.
 *
 * 2. CADA RESPUESTA MUESTRA DE DÓNDE SALIÓ. Un chat que solo devuelve una cifra
 *    es peligroso en una reunión: si se equivoca, se equivoca con seguridad y
 *    nadie lo nota. Debajo de cada respuesta va «Con qué lo consultó», que se
 *    despliega y enseña la consulta y las filas exactas que se usaron.
 *
 * EL ERROR DE LA BARRA DE DESPLAZAMIENTO (07-09). El área de mensajes era
 * `flex-1 overflow-y-auto` y no se podía bajar bien. Faltaba `min-h-0`: en una
 * columna flex, un hijo trae `min-height: auto` y por eso NO se encoge por
 * debajo de su contenido — crecía el panel entero en vez de desplazarse el
 * listado. Es el error más común de este layout y no se ve leyendo el código.
 * De paso, el autoscroll dejó de usar `scrollIntoView`, que empuja también a
 * los contenedores de arriba: ahora se mueve solo esta caja.
 *
 * LO QUE SANTOS PIDIÓ QUITAR (07-09): la nota al pie sobre el piloto y el
 * párrafo explicativo del estado vacío. Tenía razón: la pantalla se explicaba
 * a sí misma tres veces. Lo que la letra chica decía —que solo consulta— está
 * garantizado en el servidor, que es donde importa, no en un aviso que nadie
 * lee dos veces.
 */

interface Evidencia {
  herramienta: string;
  argumentos: Record<string, unknown>;
  resumen: string;
  datos: unknown;
}

interface Mensaje {
  texto: string;
  mio: boolean;
  evidencias?: Evidencia[];
  error?: boolean;
}

const SUGERENCIAS = [
  "¿Cuánto vendió Katerine esta semana?",
  "¿De quién es el cliente Sierra Travel?",
  "¿Qué perdimos la semana pasada y por qué?",
  "¿Qué lavadoras de 30 kg tenemos y a cuánto?",
];

export function AsistenteChat({
  nombre,
  claseContenedor = "mx-auto h-[calc(100vh-9rem)] w-full max-w-3xl rounded-xl border border-border shadow-sm",
  onCerrar,
}: {
  nombre: string;
  /** El marco cambia según dónde viva: pantalla completa o burbuja flotante. */
  claseContenedor?: string;
  onCerrar?: () => void;
}) {
  const [entrada, setEntrada] = useState("");
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pensando, setPensando] = useState(false);
  const [enfocado, setEnfocado] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  // EL HILO VIVE EN GOOGLE. Acá solo guardamos el id de la última interacción y
  // lo mandamos de vuelta; así «¿y de Katerine?» sabe de qué veníamos hablando
  // sin reenviar toda la conversación en cada pregunta.
  const hilo = useRef<string | null>(null);
  // Qué modelo viene atendiendo el hilo: si Google nos pasó al de respaldo por
  // falta de cuota, el id anterior ya no le sirve.
  const modelo = useRef<string | null>(null);

  // Bajar solo ESTA caja, sin arrastrar la pantalla de atrás.
  useEffect(() => {
    const caja = listaRef.current;
    if (caja) caja.scrollTo({ top: caja.scrollHeight, behavior: "smooth" });
  }, [mensajes, pensando]);

  async function preguntar(texto: string) {
    const pregunta = texto.trim();
    if (!pregunta || pensando) return;

    setMensajes((prev) => [...prev, { texto: pregunta, mio: true }]);
    setEntrada("");
    setPensando(true);

    // Si el servidor se pasa del tiempo, la plataforma lo corta y devuelve una
    // página de error, no JSON. Sin esto el gerente veía «no carga» y nada más.
    const corte = new AbortController();
    const alarma = setTimeout(() => corte.abort(), 75_000);

    try {
      const r = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta, anterior: hilo.current, modelo: modelo.current }),
        signal: corte.signal,
      });

      // Puede no ser JSON: un 504 de la plataforma llega como HTML.
      const d = await r.json().catch(() => null);
      if (!d) {
        setMensajes((prev) => [
          ...prev,
          {
            texto:
              r.status === 504 || r.status === 502
                ? "La consulta tardó demasiado y se cortó. Pruebe con algo más concreto: un comercial, una semana o un número de documento."
                : `El servidor respondió mal (código ${r.status}).`,
            mio: false,
            error: true,
          },
        ]);
        return;
      }

      if (r.ok && d.interaccion) {
        hilo.current = d.interaccion;
        modelo.current = d.modelo ?? null;
      }
      setMensajes((prev) => [
        ...prev,
        r.ok
          ? { texto: d.respuesta, mio: false, evidencias: d.evidencias }
          : { texto: d.error ?? "No se pudo consultar.", mio: false, error: true },
      ]);
    } catch (e) {
      const abortada = e instanceof DOMException && e.name === "AbortError";
      setMensajes((prev) => [
        ...prev,
        {
          texto: abortada
            ? "La consulta tardó demasiado y la corté. Pruebe con algo más concreto: un comercial, una semana o un número de documento."
            : "No se pudo conectar con el asistente.",
          mio: false,
          error: true,
        },
      ]);
    } finally {
      clearTimeout(alarma);
      setPensando(false);
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden bg-card", claseContenedor)}>
      {/* Cabecera */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-secondary/30 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-primary" />
          <h2 className="text-[13px] font-semibold tracking-tight text-foreground">Asistente</h2>
        </div>
        <div className="flex items-center gap-2.5">
          {mensajes.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMensajes([]);
                hilo.current = null;
                modelo.current = null;
              }}
              title="Empezar de nuevo"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          {onCerrar && (
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar el asistente"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Conversación. `min-h-0` es lo que hace que esto se desplace de verdad. */}
      <div ref={listaRef} className="barra-fina min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {mensajes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-2 text-center">
            <div className="animar-latido flex size-11 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="size-5 text-primary" />
            </div>
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
              ¿Qué necesita saber, {nombre.split(" ")[0]}?
            </h3>
            <div className="grid w-full max-w-sm gap-1.5">
              {SUGERENCIAS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => preguntar(s)}
                  style={{ animationDelay: `${i * 55}ms` }}
                  className="animar-entrada rounded-lg border border-border/70 bg-background px-3 py-2 text-left text-[12px] leading-snug text-muted-foreground transition-all hover:-translate-y-px hover:border-primary/40 hover:bg-accent hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {mensajes.map((m, i) => (
              <div key={i} className={cn("flex", m.mio ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "animar-entrada max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-[1.55]",
                    m.mio
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : m.error
                        ? "rounded-bl-sm border border-destructive/40 bg-destructive/5 text-destructive"
                        : "rounded-bl-sm border border-border/70 bg-secondary/40 text-foreground",
                  )}
                >
                  <p className="whitespace-pre-line">{m.texto}</p>

                  {/* De dónde salió. Nunca una cifra sin respaldo. */}
                  {m.evidencias && m.evidencias.length > 0 && (
                    <details className="group mt-2 border-t border-border/60 pt-1.5">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                        <Database className="size-3" />
                        Con qué lo consultó ({m.evidencias.length})
                        <ChevronDown className="size-3 transition-transform duration-200 group-open:rotate-180" />
                      </summary>
                      <div className="mt-1.5 space-y-1.5">
                        {m.evidencias.map((e, k) => (
                          <div key={k} className="animar-entrada rounded-md border border-border/70 bg-background p-2">
                            <p className="font-mono text-[10px] font-semibold text-primary">{e.herramienta}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{e.resumen}</p>
                            <pre className="barra-fina mt-1.5 max-h-44 overflow-auto rounded bg-muted p-2 text-[10px] leading-relaxed text-foreground">
                              {JSON.stringify(e.datos, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            ))}

            {pensando && (
              <div className="flex justify-start">
                <div className="animar-entrada flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border/70 bg-secondary/40 px-3 py-2.5">
                  <span className="flex gap-1">
                    <span className="animar-punto size-1.5 rounded-full bg-primary" />
                    <span className="animar-punto size-1.5 rounded-full bg-primary [animation-delay:.15s]" />
                    <span className="animar-punto size-1.5 rounded-full bg-primary [animation-delay:.3s]" />
                  </span>
                  <span className="text-[11px] text-muted-foreground">consultando el CRM…</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Escribir */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          preguntar(entrada);
        }}
        className={cn(
          "shrink-0 border-t px-3 py-2.5 transition-colors",
          enfocado ? "border-primary/40 bg-secondary/25" : "border-border bg-background",
        )}
      >
        <div className="relative flex items-center">
          <input
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            onFocus={() => setEnfocado(true)}
            onBlur={() => setEnfocado(false)}
            placeholder="¿Qué necesita saber?"
            className="w-full rounded-full border border-input bg-background py-2 pl-3.5 pr-10 text-[13px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/25"
          />
          <button
            type="submit"
            disabled={entrada.trim() === "" || pensando}
            aria-label="Preguntar"
            className={cn(
              "absolute right-1 rounded-full p-1.5 transition-all",
              entrada.trim() === "" || pensando
                ? "scale-95 cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95",
            )}
          >
            {pensando ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          </button>
        </div>
      </form>

      <style>{`
        @keyframes entrada { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .animar-entrada { animation: entrada .28s cubic-bezier(.16,1,.3,1) both; }
        @keyframes punto { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
        .animar-punto { animation: punto 1.1s ease-in-out infinite; }
        @keyframes latido { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        .animar-latido { animation: latido 2.8s ease-in-out infinite; }
        .barra-fina { scrollbar-width: thin; scrollbar-color: color-mix(in oklab, currentColor 22%, transparent) transparent; }
        .barra-fina::-webkit-scrollbar { width: 8px; height: 8px; }
        .barra-fina::-webkit-scrollbar-thumb { background: color-mix(in oklab, currentColor 20%, transparent); border-radius: 99px; }
        .barra-fina::-webkit-scrollbar-track { background: transparent; }
        @media (prefers-reduced-motion: reduce) {
          .animar-entrada, .animar-punto, .animar-latido { animation: none; }
        }
      `}</style>
    </div>
  );
}
