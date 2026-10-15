"use client";

import { useState, useRef, useEffect } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  Database,
  FileText,
  Image as IconoImagen,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  SquarePen,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TextoAsistente } from "@/components/crm/texto-asistente";
import { AvatarEfamein } from "@/components/crm/avatar-efamein";

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

/** Dónde recuerda el navegador la conversación abierta. */
const CLAVE_HILO = "crm:asistente-conversacion";

const SUGERENCIAS_GENERALES = [
  "¿Cómo funciona la aprobación de una cotización?",
  "¿Qué pasa con un pedido después del cierre?",
  "¿De quién es el cliente Sierra Travel?",
  "¿Qué lavadoras de 30 kg tenemos?",
];

export function AsistenteChat({
  nombre,
  claseContenedor = "mx-auto h-[calc(100vh-9rem)] w-full max-w-4xl rounded-2xl border border-border/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.16)]",
  onCerrar,
  sugerencias = SUGERENCIAS_GENERALES,
  grande = false,
  onAlternarTamano,
  onMinimizar,
  onActividad,
}: {
  nombre: string;
  /** El marco cambia según dónde viva: pantalla completa o burbuja flotante. */
  claseContenedor?: string;
  onCerrar?: () => void;
  /** Ventana agrandada: el texto se centra a lo ancho de lectura cómoda. */
  grande?: boolean;
  /** Si existe, la cabecera ofrece agrandar y volver al tamaño normal. */
  onAlternarTamano?: () => void;
  /** Si existe, la cabecera ofrece encoger la ventana a la bolita sin perder la conversación. */
  onMinimizar?: () => void;
  /** Avisa cuántos mensajes hay y si está pensando (la bolita lo muestra minimizada). */
  onActividad?: (a: { mensajes: number; pensando: boolean }) => void;
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

  // LA CONVERSACIÓN SOBREVIVE A LA RECARGA (Santos, 14-10: «cada vez que se
  // actualiza se pierde el historial»). El id se recuerda en el navegador y,
  // al abrir, se vuelve a traer del servidor lo ya conversado. Si no es de
  // quien entró (otra persona en la misma PC), el servidor dice 404 y se
  // empieza de cero. Solo «Nueva conversación» la olvida.
  const recordarHilo = (id: string | null) => {
    hilo.current = id;
    try {
      if (id) localStorage.setItem(CLAVE_HILO, id);
      else localStorage.removeItem(CLAVE_HILO);
    } catch {}
  };
  useEffect(() => {
    let id: string | null = null;
    try {
      id = localStorage.getItem(CLAVE_HILO);
    } catch {}
    if (!id) return;
    let vigente = true;
    fetch(`/api/asistente?conversacion=${encodeURIComponent(id)}`)
      .then(async (r) => {
        if (!vigente) return;
        if (r.status === 404 || r.status === 400) {
          recordarHilo(null);
          return;
        }
        if (!r.ok) return;
        const d = (await r.json()) as { mensajes?: Mensaje[] };
        if (!vigente || !d.mensajes?.length) return;
        hilo.current = id;
        // Si ya preguntó algo mientras cargaba, no se le pisa.
        setMensajes((prev) => (prev.length ? prev : d.mensajes!));
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  // La burbuja necesita saber si hay conversación y si está pensando, para
  // mostrarlo en la bolita mientras la ventana está minimizada.
  useEffect(() => {
    onActividad?.({ mensajes: mensajes.length, pensando });
  }, [mensajes.length, pensando, onActividad]);

  // EL DESPLAZAMIENTO (14-10). Se mueve solo ESTA caja, sin arrastrar la
  // pantalla de atrás. Al preguntar, baja para mostrar la pregunta y el
  // «pensando». Al terminar, deja la pregunta ARRIBA: una respuesta larga se
  // lee de arriba hacia abajo, y antes quedaba mostrando su final (Santos:
  // «a veces hay mucha información»).
  const ultimaPregunta = useRef<HTMLDivElement>(null);
  const cantidad = mensajes.length;
  const escribiendo = mensajes[mensajes.length - 1]?.escribiendo ?? false;
  useEffect(() => {
    const caja = listaRef.current;
    if (!caja) return;
    const p = ultimaPregunta.current;
    if (!escribiendo && p) {
      caja.scrollTo({ top: Math.max(0, p.offsetTop - 16), behavior: "smooth" });
    } else {
      caja.scrollTo({ top: caja.scrollHeight, behavior: "smooth" });
    }
  }, [cantidad, escribiendo]);

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
          if (e.t === "conversacion") recordarHilo(e.id);
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

  // La caja de texto crece con lo que se escribe, hasta un tope.
  const textoRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = textoRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, grande ? 200 : 140)}px`;
  }, [entrada, grande]);

  const ancho = grande ? "mx-auto w-full max-w-3xl" : "w-full";
  const puedeEnviar = (entrada.trim() !== "" || archivos.length > 0) && !pensando;

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden bg-card text-foreground", claseContenedor)}>
      {/* Cabecera: quién es, y los tres controles de la ventana. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-gradient-to-b from-secondary/50 to-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Solo «Efamein», con su cara (Santos, 15-10). */}
          <AvatarEfamein className="size-8" />
          <div className="min-w-0 leading-tight">
            <h2 className="truncate text-[14px] font-bold tracking-tight">Efamein</h2>
            {pensando && <p className="truncate text-[11.5px] text-muted-foreground">Consultando el CRM…</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {mensajes.length > 0 && (
            <BotonVentana
              titulo="Nueva conversación"
              onClick={() => {
                setMensajes([]);
                recordarHilo(null);
              }}
            >
              <SquarePen className="size-4" />
            </BotonVentana>
          )}
          {/* Minimizar (Santos, 14-10: «si le dan en "x" se cierra y todo
              empieza de nuevo»). Encoge la ventana a la bolita; la
              conversación sigue ahí, incluso la respuesta que se está
              escribiendo. */}
          {onMinimizar && (
            <BotonVentana titulo="Minimizar (la conversación se guarda)" onClick={onMinimizar}>
              <Minus className="size-4" />
            </BotonVentana>
          )}
          {onAlternarTamano && (
            <BotonVentana titulo={grande ? "Volver al tamaño normal" : "Agrandar"} onClick={onAlternarTamano} className="hidden sm:inline-flex">
              {grande ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </BotonVentana>
          )}
          {onCerrar && (
            <BotonVentana titulo={mensajes.length > 0 ? "Cerrar y terminar esta conversación" : "Cerrar"} onClick={onCerrar}>
              <X className="size-4" />
            </BotonVentana>
          )}
        </div>
      </div>

      {/* Conversación. `min-h-0` es lo que hace que esto se desplace de verdad. */}
      <div ref={listaRef} className="barra-fina relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {mensajes.length === 0 ? (
          <div className={cn("flex h-full flex-col items-center justify-center gap-5 px-1 text-center", ancho)}>
            <AvatarEfamein className="size-16 rounded-2xl" />
            <div>
              <h3 className="text-[18px] font-bold tracking-tight">Hola, {nombre.split(" ")[0]}. ¿En qué le ayudo?</h3>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
                Pregunte por un pedido, una cotización, un cliente, cómo funciona algo o qué se acordó en una reunión. También puede adjuntar fotos, PDF, Word o Excel.
              </p>
            </div>
            <div className={cn("grid w-full gap-2", grande ? "max-w-2xl sm:grid-cols-2" : "max-w-sm")}>
              {sugerencias.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => preguntar(s)}
                  style={{ animationDelay: `${i * 55}ms` }}
                  className="animar-entrada group flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-card px-3.5 py-2.5 text-left text-[13px] leading-snug text-foreground/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-px hover:border-primary/40 hover:text-foreground hover:shadow-md"
                >
                  {s}
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={cn("space-y-5", ancho)}>
            {mensajes.map((m, i) =>
              m.mio ? (
                <div key={i} ref={i === mensajes.length - 2 ? ultimaPregunta : undefined} className="animar-entrada flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[14px] leading-relaxed text-primary-foreground shadow-sm">
                    {m.adjuntos && m.adjuntos.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        {m.adjuntos.map((n, k) => (
                          <span key={k} className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary-foreground/15 px-1.5 py-0.5 text-[11.5px]">
                            <Paperclip className="size-3 shrink-0" />
                            <span className="truncate">{n}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {m.texto && <p className="whitespace-pre-line">{m.texto}</p>}
                  </div>
                </div>
              ) : (
                <div key={i} className="animar-entrada flex gap-3">
                  <AvatarEfamein className="mt-0.5 size-7" sonrie={false} />
                  <div className="min-w-0 flex-1">
                    {m.error ? (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[14px] text-destructive">
                        <p className="whitespace-pre-line">{m.texto}</p>
                      </div>
                    ) : (
                      m.texto && <TextoAsistente texto={m.texto} className={cn("text-foreground", grande ? "text-[15px]" : "text-[14px]")} />
                    )}

                    {/* Mientras trabaja: qué está mirando, o que está pensando. */}
                    {m.escribiendo && (m.consultando || !m.texto) && (
                      <div className={cn("inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/40 px-3 py-1.5", m.texto && "mt-2")}>
                        <span className="flex gap-1">
                          <span className="animar-punto size-1.5 rounded-full bg-primary" />
                          <span className="animar-punto size-1.5 rounded-full bg-primary [animation-delay:.15s]" />
                          <span className="animar-punto size-1.5 rounded-full bg-primary [animation-delay:.3s]" />
                        </span>
                        <span className="text-[12px] text-muted-foreground">{m.consultando ? `${m.consultando}…` : "Pensando…"}</span>
                      </div>
                    )}

                    {/* De dónde salió. Nunca una cifra sin respaldo. */}
                    {m.evidencias && m.evidencias.length > 0 && (
                      <details className="group mt-3">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
                          <Database className="size-3" />
                          De dónde lo sacó
                          <ChevronDown className="size-3 transition-transform duration-200 group-open:rotate-180" />
                        </summary>
                        <ul className="mt-2 space-y-1 border-l-2 border-border pl-3 text-[12px]">
                          {m.evidencias.map((e, k) => (
                            <li key={k} className="text-muted-foreground">
                              <span className="text-foreground">{e.texto}</span> → {e.resumen}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
              ),
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
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          sumarArchivos([...e.dataTransfer.files]);
        }}
        className="shrink-0 border-t border-border/70 bg-card px-4 pb-3 pt-3"
      >
        <div className={ancho}>
          <div
            className={cn(
              "rounded-2xl border bg-background shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all",
              enfocado ? "border-primary/50 ring-4 ring-primary/10" : "border-border",
            )}
          >
            {(archivos.length > 0 || avisoArchivos) && (
              <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
                {archivos.map((a, i) => (
                  <span key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-secondary/50 py-1 pl-2 pr-1 text-[12px]">
                    {a.type.startsWith("image/") ? <IconoImagen className="size-3.5 shrink-0 text-primary" /> : <FileText className="size-3.5 shrink-0 text-primary" />}
                    <span className="max-w-[180px] truncate">{a.name}</span>
                    <button
                      type="button"
                      onClick={() => setArchivos((prev) => prev.filter((_, k) => k !== i))}
                      aria-label={`Quitar ${a.name}`}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {avisoArchivos && <span className="text-[12px] text-destructive">{avisoArchivos}</span>}
              </div>
            )}
            <textarea
              ref={textoRef}
              rows={1}
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              onKeyDown={(e) => {
                // Enter envía; Shift+Enter baja de línea (lo que la mano espera de un chat).
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  preguntar(entrada);
                }
              }}
              onPaste={(e) => {
                const pegados = [...e.clipboardData.files];
                if (pegados.length) {
                  e.preventDefault();
                  sumarArchivos(pegados);
                }
              }}
              onFocus={() => setEnfocado(true)}
              onBlur={() => setEnfocado(false)}
              placeholder="Escriba su pregunta…"
              className="block w-full resize-none border-0 bg-transparent px-3.5 pb-1 pt-2.5 text-[14px] leading-relaxed text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground/70 focus-visible:border-transparent! focus-visible:shadow-none! focus-visible:outline-none"
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              <div className="flex items-center gap-1">
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
                  title="Adjuntar fotos, PDF, Word o Excel"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <Paperclip className="size-4" />
                  <span className={cn(!grande && "sr-only")}>Adjuntar</span>
                </button>
                <span className="hidden text-[11px] text-muted-foreground/70 lg:inline">Enter envía · Shift+Enter, nueva línea</span>
              </div>
              <button
                type="submit"
                disabled={!puedeEnviar}
                aria-label="Preguntar"
                className={cn(
                  "flex size-8 items-center justify-center rounded-full transition-all",
                  puedeEnviar
                    ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md active:scale-95"
                    : "cursor-not-allowed bg-muted text-muted-foreground",
                )}
              >
                {pensando ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[10.5px] text-muted-foreground/70">
            Solo consulta: no cambia nada en el CRM. Verifique lo importante en su pantalla.
          </p>
        </div>
      </form>

      <style>{`
        @keyframes entrada { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .animar-entrada { animation: entrada .28s cubic-bezier(.16,1,.3,1) both; }
        @keyframes punto { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
        .animar-punto { animation: punto 1.1s ease-in-out infinite; }
        @keyframes latido { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
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

/** Un botón de la cabecera: cuadrado, con su nombre al pasar el mouse. */
function BotonVentana({
  titulo,
  onClick,
  className,
  children,
}: {
  titulo: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className,
      )}
    >
      {children}
    </button>
  );
}
