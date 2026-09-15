"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Mail, Megaphone, MessageCircle, X } from "lucide-react";
import { acusarComunicado, enviarFeedbackComunicado } from "@/lib/acciones/comunicados";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface Lamina {
  titulo: string;
  texto?: string | null;
  imagen?: string | null;
  imagen2x?: string | null;
  mini?: string | null;
}

export interface ComunicadoPendiente {
  id: string;
  clave: string;
  titulo: string;
  laminas: Lamina[];
  enlace: string | null;
  enlace_texto: string | null;
  disposicion: string | null;
  disposicion_boton: string | null;
  feedback_correo: string | null;
  feedback_whatsapp: string | null;
  feedback_pregunta: string | null;
  leido_at: string | null;
  cumplido_at: string | null;
  feedback_at: string | null;
}

/**
 * EL COMUNICADO DE GERENCIA, AL ENTRAR (Carlos 14-09; Santos 14-09 noche).
 *
 * Las láminas son imágenes y se pasan con un clic sobre la imagen, con las
 * flechas, con el teclado o deslizando en el celular. Al final, la
 * disposición de gerencia y el feedback de la web: la persona escribe qué vio
 * y lo manda por correo o por WhatsApp; recién entonces puede cerrar. «Lo veo
 * luego» siempre está: vuelve mañana y no bloquea el trabajo de hoy.
 *
 * Velocidad: las imágenes van en WebP a 720 px (y 1080 para pantallas
 * retina), 60-90 KB cada una, con una miniatura de medio KB de fondo mientras
 * cargan; la siguiente se precarga apenas se ve la actual.
 */
export function ComunicadoDeGerencia({ comunicado }: { comunicado: ComunicadoPendiente }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(true);
  const [i, setI] = useState(0);
  const [enviando, startTransition] = useTransition();
  const [texto, setTexto] = useState("");
  const [feedbackHecho, setFeedbackHecho] = useState(Boolean(comunicado.feedback_at));
  const [cumplido, setCumplido] = useState(Boolean(comunicado.cumplido_at));
  const laminas = comunicado.laminas;
  const total = laminas.length + 1; // + la lámina final (disposición y feedback)
  const enFinal = i >= laminas.length;
  const l = enFinal ? null : laminas[i];
  const pideFeedback = Boolean(comunicado.feedback_correo || comunicado.feedback_whatsapp);
  const puedeCerrar = !pideFeedback || feedbackHecho;

  const ir = useCallback((k: number) => setI(Math.max(0, Math.min(total - 1, k))), [total]);
  const siguiente = useCallback(() => ir(i + 1), [i, ir]);
  const anterior = useCallback(() => ir(i - 1), [i, ir]);

  // Precargar la que sigue: al tocar, ya está.
  useEffect(() => {
    const prox = laminas[i + 1];
    if (prox?.imagen) {
      const img = new Image();
      img.src = window.devicePixelRatio > 1.5 && prox.imagen2x ? prox.imagen2x : prox.imagen;
    }
  }, [i, laminas]);

  // Flechas del teclado.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") siguiente();
      if (e.key === "ArrowLeft") anterior();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto, siguiente, anterior]);

  // Deslizar en el celular.
  const toqueX = useRef<number | null>(null);
  const alTocar = (e: React.TouchEvent) => { toqueX.current = e.touches[0]?.clientX ?? null; };
  const alSoltar = (e: React.TouchEvent) => {
    if (toqueX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? toqueX.current) - toqueX.current;
    toqueX.current = null;
    if (Math.abs(dx) > 40) (dx < 0 ? siguiente : anterior)();
  };

  function acusar(accion: "leido" | "cumplido" | "luego", cerrar = true) {
    startTransition(async () => {
      const r = await acusarComunicado(comunicado.id, accion);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      if (accion === "cumplido") {
        setCumplido(true);
        toast.success("Registrado: ya está en la web.");
      }
      if (cerrar) {
        setAbierto(false);
        router.refresh();
      }
    });
  }

  function mandarFeedback(via: "correo" | "whatsapp") {
    const t = texto.trim();
    if (t.length < 10) {
      toast.error("Escriba qué vio en la web: un enlace, una captura o una sugerencia. Una línea alcanza.");
      return;
    }
    // El WhatsApp se abre en el instante del clic (los navegadores bloquean
    // las ventanas que se abren después de esperar al servidor).
    if (via === "whatsapp" && comunicado.feedback_whatsapp) {
      const mensaje = `Feedback de la web (www.efameinsa.com):\n${t}`;
      window.open(`https://wa.me/${comunicado.feedback_whatsapp}?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener");
    }
    startTransition(async () => {
      const r = await enviarFeedbackComunicado({ comunicadoId: comunicado.id, texto: t, via });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      setFeedbackHecho(true);
      if (via === "correo") {
        toast.success(r.correoEnviado ? "Enviado por correo. ¡Gracias!" : "Quedó registrado en el CRM (el correo no salió; se lee igual desde acá).");
      } else {
        toast.success("Quedó registrado; termine de enviarlo en WhatsApp.");
      }
    });
  }

  // Cerrar sin terminar es «lo veo luego»: vuelve mañana.
  function alCerrar(v: boolean) {
    if (v) return;
    if (puedeCerrar) acusar("leido");
    else acusar("luego");
  }

  return (
    <Dialog open={abierto} onOpenChange={alCerrar}>
      <DialogContent
        showCloseButton={false}
        className="gap-3 p-0 sm:max-w-[440px] [&>*]:px-0"
        onTouchStart={alTocar}
        onTouchEnd={alSoltar}
      >
        {/* Cabecera mínima: la imagen es el mensaje. */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <DialogTitle className="flex items-center gap-1.5 text-sm font-semibold">
            <Megaphone className="size-4 text-primary" /> Comunicado de gerencia
          </DialogTitle>
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-muted-foreground">{i + 1} / {total}</span>
            <button
              type="button"
              onClick={() => alCerrar(false)}
              title={puedeCerrar ? "Cerrar" : "Lo veo luego (vuelve mañana)"}
              className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <DialogDescription className="sr-only">{comunicado.titulo}</DialogDescription>

        {l ? (
          <button
            type="button"
            onClick={siguiente}
            className="group relative mx-4 block overflow-hidden rounded-lg border border-border bg-secondary text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ aspectRatio: "4 / 5", maxHeight: "68vh" }}
            aria-label={`${l.titulo}. Toque para ver la siguiente lámina.`}
          >
            {l.imagen ? (
              <>
                {l.mini && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.mini} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover blur-md" />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={l.imagen}
                  src={l.imagen}
                  srcSet={l.imagen2x ? `${l.imagen} 720w, ${l.imagen2x} 1080w` : undefined}
                  sizes="(max-width: 480px) 92vw, 408px"
                  alt={l.titulo}
                  decoding="async"
                  fetchPriority={i === 0 ? "high" : "auto"}
                  className="relative size-full object-cover"
                />
              </>
            ) : (
              <div className="flex size-full flex-col justify-center p-6">
                <p className="text-xl font-bold text-foreground">{l.titulo}</p>
                {l.texto && <p className="mt-2 text-sm leading-relaxed text-foreground">{l.texto}</p>}
              </div>
            )}
            <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/45 to-transparent px-3 pb-2 pt-8 text-[11px] font-medium text-white opacity-90 transition-opacity group-hover:opacity-100">
              {i < laminas.length - 1 ? "Toca la imagen para seguir" : "Toca para terminar"} <ChevronRight className="size-3.5" />
            </span>
          </button>
        ) : (
          <div className="mx-4 space-y-3">
            {comunicado.disposicion && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Disposición de gerencia</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">{comunicado.disposicion}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {comunicado.enlace && (
                    <Button size="sm" variant="outline" onClick={() => window.open(comunicado.enlace!, "_blank", "noopener")}>
                      <ExternalLink className="size-3.5" /> {comunicado.enlace_texto ?? "Abrir el enlace"}
                    </Button>
                  )}
                  {cumplido ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#1E7F4F]/10 px-2.5 py-1.5 text-xs font-semibold text-[#1E7F4F]">
                      <CheckCircle2 className="size-3.5" /> {comunicado.disposicion_boton ?? "Cumplido"}
                    </span>
                  ) : (
                    <Button size="sm" disabled={enviando} onClick={() => acusar("cumplido", false)}>
                      <CheckCircle2 className="size-3.5" /> {comunicado.disposicion_boton ?? "Ya lo cumplí"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {pideFeedback && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-foreground">{comunicado.feedback_pregunta ?? "¿Qué viste por mejorar?"}</p>
                {feedbackHecho ? (
                  <p className="inline-flex items-center gap-1.5 text-sm text-[#1E7F4F]">
                    <CheckCircle2 className="size-4" /> Gracias, tu feedback quedó registrado.
                  </p>
                ) : (
                  <>
                    <textarea
                      rows={3}
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      placeholder="Ej.: en la ficha de la UW130 falta el voltaje · https://www.efameinsa.com/… · el botón de cotizar no se ve en el celular"
                      className="w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {comunicado.feedback_correo && (
                        <Button size="sm" disabled={enviando || texto.trim().length < 10} onClick={() => mandarFeedback("correo")}>
                          <Mail className="size-3.5" /> Enviar por correo
                        </Button>
                      )}
                      {comunicado.feedback_whatsapp && (
                        <Button size="sm" variant="outline" disabled={enviando || texto.trim().length < 10} onClick={() => mandarFeedback("whatsapp")}>
                          <MessageCircle className="size-3.5" /> Enviar por WhatsApp
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Un enlace, una captura descrita o una sugerencia. Con esto cerramos el comunicado.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navegación: puntos, flechas y las salidas. */}
        <div className="flex items-center justify-between gap-2 px-4 pb-3">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-8 px-2" disabled={i === 0} onClick={anterior} aria-label="Anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <div className="flex items-center gap-1.5 px-1">
              {Array.from({ length: total }).map((_, k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={`Ir a ${k + 1}`}
                  onClick={() => ir(k)}
                  className={cn("size-2 rounded-full transition-colors", k === i ? "bg-primary" : "bg-border hover:bg-muted-foreground/50")}
                />
              ))}
            </div>
            {!enFinal && (
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={siguiente} aria-label="Siguiente">
                <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
          <div className="flex gap-1.5">
            {!puedeCerrar && (
              <Button size="sm" variant="ghost" disabled={enviando} onClick={() => acusar("luego")}>
                Lo veo luego
              </Button>
            )}
            {enFinal && puedeCerrar && (
              <Button size="sm" disabled={enviando} onClick={() => acusar("leido")}>
                Cerrar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
