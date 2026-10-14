"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Trash2, Loader2, ChevronDown, Database, X, Paperclip, FileText, Image as IconoImagen } from "lucide-react";
import { cn } from "@/lib/utils";
import { TextoAsistente } from "@/components/crm/texto-asistente";

/** Lo mismo que acepta el servidor (lib/asistente/adjuntos.ts). */
const ACEPTA = "image/jpeg,image/png,image/webp,image/gif,application/pdf,.docx,.xlsx,.xls,.csv,.txt";
const MAX_ARCHIVOS = 5;

/**
 * Una foto de celular pesa 4-6 MB y el internet de la oficina es lento: se
 * achica en el navegador antes de subirla (el servidor igual la deja en 2000
 * px). Si el navegador no la puede abrir (HEIC en Windows), va como está.
 */
async function achicarFoto(a: File): Promise<File> {
  if (!a.type.startsWith("image/") || a.type === "image/gif" || a.size < 1_500_000) return a;
  try {
    const bmp = await createImageBitmap(a);
    const escala = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bmp.width * escala);
    lienzo.height = Math.round(bmp.height * escala);
    lienzo.getContext("2d")!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], a.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : a;
  } catch {
    return a;
  }
}

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
 *    nadie lo nota. Debajo de cada respuesta va «De dónde lo sacó»: qué revisó
 *    en el CRM y qué encontró, en palabras. Hasta el 14-10 enseñaba el nombre
 *    interno de la consulta y los datos crudos; Santos lo vio con una pregunta
 *    de Ariana y no le dice nada a quien pregunta. El detalle completo quedó
 *    en la auditoría de admin.
 *
 * EL ERROR DE LA BARRA DE DESPLAZAMIENTO (07-09). El área de mensajes era
 * `flex-1 overflow-y-auto` y no se podía bajar bien. Faltaba `min-h-0`: en una
 * columna flex, un hijo trae `min-height: auto` y por eso NO se encoge por
 * debajo de su contenido — crecía el panel entero en vez de desplazarse el
 * listado. Es el error más común de este layout y no se ve leyendo el código.
 * De paso, el autoscroll dejó de usar `scrollIntoView`, que empuja también a
 * los contenedores de arriba: ahora se mueve solo esta caja.
 *
 * LA RESPUESTA SE VE MIENTRAS SE ESCRIBE (14-10, con Claude). Con el Gemini
 * gratuito se miraban tres puntitos durante 40 segundos. Ahora el servidor
 * manda la respuesta por pedazos y avisa qué está consultando («Revisando el
 * pedido 420-26…»), así que la espera se entiende y se acorta.
 *
 * LO QUE SANTOS PIDIÓ QUITAR (07-09): la nota al pie sobre el piloto y el
 * párrafo explicativo del estado vacío. Tenía razón: la pantalla se explicaba
 * a sí misma tres veces. Lo que la letra chica decía —que solo consulta— está
 * garantizado en el servidor, que es donde importa, no en un aviso que nadie
 * lee dos veces.
 */

/** Qué revisó en el CRM y qué encontró, ya en palabras (api/asistente). */
interface Evidencia {
  texto: string;
  resumen: string;
}

interface Mensaje {
  texto: string;
  mio: boolean;
  /** Los nombres de lo que adjuntó, en la burbuja de la pregunta. */
  adjuntos?: string[];
  evidencias?: Evidencia[];
  error?: boolean;
  /** Mientras se escribe: qué está consultando ahora («Revisando el pedido…»). */
  consultando?: string | null;
  escribiendo?: boolean;
}

/** Lo que llega del servidor, una línea JSON por evento (api/asistente). */
type Evento =
  | { t: "conversacion"; id: string }
  | { t: "consulta"; texto: string }
  | { t: "texto"; d: string }
  | { t: "fin"; evidencias: Evidencia[]; ms: number }
  | { t: "error"; mensaje: string };

const SUGERENCIAS_GENERALES = [
  "¿Cómo funciona la aprobación de una cotización?",
  "¿Qué pasa con un pedido después del cierre?",
  "¿De quién es el cliente Sierra Travel?",
  "¿Qué lavadoras de 30 kg tenemos?",
];

export function AsistenteChat({
  nombre,
  claseContenedor = "mx-auto h-[calc(100vh-9rem)] w-full max-w-3xl rounded-xl border border-border shadow-sm",
  onCerrar,
  sugerencias = SUGERENCIAS_GENERALES,
}: {
  nombre: string;
  /** El marco cambia según dónde viva: pantalla completa o burbuja flotante. */
  claseContenedor?: string;
  onCerrar?: () => void;
  /** Las preguntas de ejemplo, según el área de quien mira. */
  sugerencias?: string[];
}) {
  const [entrada, setEntrada] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [avisoArchivos, setAvisoArchivos] = useState<string | null>(null);
  const elegirRef = useRef<HTMLInputElement>(null);

  function sumarArchivos(nuevos: File[]) {
    if (!nuevos.length) return;
    setAvisoArchivos(null);
    setArchivos((prev) => {
      const todos = [...prev, ...nuevos];
      if (todos.length > MAX_ARCHIVOS) setAvisoArchivos(`Puede adjuntar hasta ${MAX_ARCHIVOS} archivos por pregunta.`);
      return todos.slice(0, MAX_ARCHIVOS);
    });
  }
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pensando, setPensando] = useState(false);
  const [enfocado, setEnfocado] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  // EL HILO VIVE EN EL SERVIDOR (0479). Acá solo se guarda el id de la
  // conversación y se manda de vuelta; así «¿y el de Katerine?» sabe de qué
  // veníamos hablando. El servidor comprueba que la conversación sea de quien
  // pregunta y rearma el historial desde la base.
  const hilo = useRef<string | null>(null);

  // Bajar solo ESTA caja, sin arrastrar la pantalla de atrás.
  useEffect(() => {
    const caja = listaRef.current;
    if (caja) caja.scrollTo({ top: caja.scrollHeight, behavior: "smooth" });
  }, [mensajes, pensando]);

  async function preguntar(texto: string) {
    const pregunta = texto.trim();
    const enviados = archivos;
    if ((!pregunta && enviados.length === 0) || pensando) return;

    // La respuesta es la última burbuja y se va llenando mientras llega.
    setMensajes((prev) => [
      ...prev,
      { texto: pregunta, mio: true, adjuntos: enviados.map((a) => a.name) },
      { texto: "", mio: false, escribiendo: true, consultando: null },
    ]);
    setEntrada("");
    setArchivos([]);
    setAvisoArchivos(null);
    setPensando(true);

    const actualizar = (cambio: (m: Mensaje) => Mensaje) =>
      setMensajes((prev) => {
        const copia = [...prev];
        copia[copia.length - 1] = cambio(copia[copia.length - 1]);
        return copia;
      });

    // Un tope por si algo queda colgado en el camino: el servidor corta solo a
    // los 100 s, así que pasado esto es la red, no la consulta.
    const corte = new AbortController();
    const alarma = setTimeout(() => corte.abort(), 150_000);

    try {
      // Con archivos va como formulario; sin archivos, como siempre.
      let r: Response;
      if (enviados.length) {
        const form = new FormData();
        form.set("pregunta", pregunta);
        if (hilo.current) form.set("conversacion", hilo.current);
        for (const a of await Promise.all(enviados.map(achicarFoto))) form.append("archivos", a);
        r = await fetch("/api/asistente", { method: "POST", body: form, signal: corte.signal });
      } else {
        r = await fetch("/api/asistente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pregunta, conversacion: hilo.current }),
          signal: corte.signal,
        });
      }

      if (!r.ok || !r.body) {
        // Los rechazos de entrada (sin sesión, apagado, conversación larga)
        // vienen en JSON; un error de la plataforma puede venir en HTML.
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        actualizar(() => ({
          texto: d?.error ?? `El servidor respondió mal (código ${r.status}). Vuelva a intentar.`,
          mio: false,
          error: true,
        }));
        return;
      }

      const lector = r.body.getReader();
      const decodificar = new TextDecoder();
      let pendiente = "";
      let terminado = false;
      while (!terminado) {
        const { value, done } = await lector.read();
        if (done) break;
        pendiente += decodificar.decode(value, { stream: true });
        const lineas = pendiente.split("\n");
        pendiente = lineas.pop() ?? "";
        for (const linea of lineas) {
          if (!linea.trim()) continue;
          const e = JSON.parse(linea) as Evento;
          if (e.t === "conversacion") hilo.current = e.id;
          else if (e.t === "consulta") actualizar((m) => ({ ...m, consultando: e.texto }));
          else if (e.t === "texto") actualizar((m) => ({ ...m, texto: m.texto + e.d, consultando: null }));
          else if (e.t === "fin") {
            actualizar((m) => ({ ...m, evidencias: e.evidencias, escribiendo: false, consultando: null }));
            terminado = true;
          } else if (e.t === "error") {
            actualizar((m) => ({
              texto: m.texto ? `${m.texto}\n\n${e.mensaje}` : e.mensaje,
              mio: false,
              error: true,
            }));
            terminado = true;
          }
        }
      }
      // Si la conexión se cortó sin «fin», se deja lo que llegó y se avisa.
      actualizar((m) =>
        m.escribiendo
          ? {
              ...m,
              escribiendo: false,
              consultando: null,
              texto: m.texto || "Se cortó la conexión antes de terminar. Vuelva a preguntar.",
              error: !m.texto,
            }
          : m,
      );
    } catch (e) {
      const abortada = e instanceof DOMException && e.name === "AbortError";
      actualizar((m) => ({
        texto: abortada
          ? "La consulta tardó demasiado y la corté. Pruebe con algo más concreto: un número de documento, un cliente o un pedido."
          : m.texto || "No se pudo conectar con el asistente.",
        mio: false,
        error: !(m.texto && !abortada),
      }));
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
          <h2 className="text-[13px] font-semibold tracking-tight text-foreground">Asistente Efamein</h2>
        </div>
        <div className="flex items-center gap-2.5">
          {mensajes.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMensajes([]);
                hilo.current = null;
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
              {sugerencias.map((s, i) => (
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
                  {m.adjuntos && m.adjuntos.length > 0 && (
                    <div className="mb-1 flex flex-wrap gap-1">
                      {m.adjuntos.map((n, k) => (
                        <span key={k} className="inline-flex items-center gap-1 rounded-md bg-primary-foreground/15 px-1.5 py-0.5 text-[11px]">
                          <Paperclip className="size-3" />
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.texto &&
                    (m.mio || m.error ? <p className="whitespace-pre-line">{m.texto}</p> : <TextoAsistente texto={m.texto} />)}

                  {/* Mientras trabaja: qué está mirando, o los puntitos. */}
                  {m.escribiendo && (m.consultando || !m.texto) && (
                    <div className={cn("flex items-center gap-2", m.texto && "mt-1.5")}>
                      <span className="flex gap-1">
                        <span className="animar-punto size-1.5 rounded-full bg-primary" />
                        <span className="animar-punto size-1.5 rounded-full bg-primary [animation-delay:.15s]" />
                        <span className="animar-punto size-1.5 rounded-full bg-primary [animation-delay:.3s]" />
                      </span>
                      <span className="text-[11px] text-muted-foreground">{m.consultando ? `${m.consultando}…` : "pensando…"}</span>
                    </div>
                  )}

                  {/* De dónde salió. Nunca una cifra sin respaldo. */}
                  {m.evidencias && m.evidencias.length > 0 && (
                    <details className="group mt-2 border-t border-border/60 pt-1.5">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                        <Database className="size-3" />
                        De dónde lo sacó
                        <ChevronDown className="size-3 transition-transform duration-200 group-open:rotate-180" />
                      </summary>
                      <ul className="mt-1.5 space-y-1 text-[11px]">
                        {m.evidencias.map((e, k) => (
                          <li key={k} className="animar-entrada text-muted-foreground">
                            <span className="text-foreground">{e.texto}</span> → {e.resumen}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            ))}

          </div>
        )}
      </div>

      {/* Escribir */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          preguntar(entrada);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          sumarArchivos([...e.dataTransfer.files]);
        }}
        className={cn(
          "shrink-0 border-t px-3 py-2.5 transition-colors",
          enfocado ? "border-primary/40 bg-secondary/25" : "border-border bg-background",
        )}
      >
        {(archivos.length > 0 || avisoArchivos) && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {archivos.map((a, i) => (
              <span key={i} className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 text-[11px] text-foreground">
                {a.type.startsWith("image/") ? <IconoImagen className="size-3 shrink-0" /> : <FileText className="size-3 shrink-0" />}
                <span className="truncate">{a.name}</span>
                <button
                  type="button"
                  onClick={() => setArchivos((prev) => prev.filter((_, k) => k !== i))}
                  aria-label={`Quitar ${a.name}`}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {avisoArchivos && <span className="text-[11px] text-destructive">{avisoArchivos}</span>}
          </div>
        )}
        <div className="relative flex items-center gap-1.5">
          <input
            ref={elegirRef}
            type="file"
            multiple
            accept={ACEPTA}
            className="hidden"
            onChange={(e) => {
              sumarArchivos([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => elegirRef.current?.click()}
            disabled={pensando}
            aria-label="Adjuntar fotos, PDF, Word o Excel"
            title="Adjuntar fotos, PDF, Word o Excel"
            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Paperclip className="size-4" />
          </button>
          <input
            onPaste={(e) => {
              const pegados = [...e.clipboardData.files];
              if (pegados.length) {
                e.preventDefault();
                sumarArchivos(pegados);
              }
            }}
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            onFocus={() => setEnfocado(true)}
            onBlur={() => setEnfocado(false)}
            placeholder="¿Qué necesita saber?"
            className="w-full rounded-full border border-input bg-background py-2 pl-3.5 pr-10 text-[13px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/25"
          />
          <button
            type="submit"
            disabled={(entrada.trim() === "" && archivos.length === 0) || pensando}
            aria-label="Preguntar"
            className={cn(
              "absolute right-1 rounded-full p-1.5 transition-all",
              (entrada.trim() === "" && archivos.length === 0) || pensando
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
