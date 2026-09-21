"use client";

// El hilo de mensajes de una conversación de WhatsApp (fase 2, 15-09-2026):
// burbujas, caja para escribir, semáforo de la ventana de 24 h, y las
// acciones de Central (derivar) y del que atiende (cerrar). Se actualiza
// solo cada 4 s mientras la pestaña está en la conversación — todavía no hay
// Supabase Realtime acá (queda para una siguiente vuelta); con esto ya se ve
// llegar un mensaje sin que alguien tenga que recargar la página.

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, MessageCircleOff, RotateCcw, Paperclip, FileText, Loader2, Mic, Trash2, Sticker as StickerIcon, Package, MousePointerClick, ShoppingCart, FileSpreadsheet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  enviarMensajeChat,
  enviarAdjuntoChat,
  enviarStickerChat,
  derivarConversacion,
  cerrarConversacion,
  reabrirConversacion,
  mensajesDe,
  stickersActivos,
  type ConversacionDetalle,
  type MensajeWhatsapp,
  type Sticker,
} from "@/lib/acciones/whatsapp-chat";
import { WhatsappMandarEquipo } from "@/components/crm/whatsapp-mandar-equipo";
import { ventanaAbierta } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

// Lo mismo que admite hoy el bucket `adjuntos` (0234): fotos, documentos de
// oficina, audio y video — igual que adjuntar un archivo en WhatsApp Web.
const ACEPTA_ADJUNTOS_CHAT =
  "image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/amr,audio/opus,video/mp4,video/3gpp";
const MAX_TAMANO_ADJUNTO_CHAT = 10 * 1024 * 1024;

function BurbujaContenido({ mensaje: m }: { mensaje: MensajeWhatsapp }) {
  if (m.tipo === "text" || m.tipo === "button") {
    return <p className="whitespace-pre-wrap">{m.texto}</p>;
  }

  // Lo que mandamos como ficha o catálogo, y lo que el cliente tocó (0250):
  // saliente = «Ficha: LG TITAN…» / «Catálogo: …»; entrante = el botón
  // que apretó («Me interesa — LAVGIA13») o el pedido que armó.
  if (m.tipo === "interactive" || m.tipo === "order") {
    const Icono = m.tipo === "order" ? ShoppingCart : m.direccion === "saliente" ? Package : MousePointerClick;
    return (
      <p className="flex items-start gap-1.5 whitespace-pre-wrap">
        <Icono className="mt-0.5 size-3.5 shrink-0 opacity-80" />
        <span>{m.texto}</span>
      </p>
    );
  }

  // Entrante sin descargar todavía (el webhook guarda el media_id de Meta,
  // pero bajar el archivo a nuestro Storage es la siguiente vuelta).
  if (!m.media_url) {
    return (
      <p className="italic opacity-80">
        <Paperclip className="mr-1 inline size-3.5" />
        {m.texto || `Archivo adjunto (${m.tipo}) — descarga automática pendiente de construir`}
      </p>
    );
  }

  if (m.tipo === "sticker") {
    // eslint-disable-next-line @next/next/no-img-element -- sticker firmado de Storage
    return <img src={m.media_url} alt="Sticker" className="size-28 object-contain" />;
  }

  if (m.tipo === "image") {
    return (
      <div className="space-y-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen firmada de Storage, no un asset de Next */}
        <img src={m.media_url} alt={m.texto || "Imagen"} className="max-h-64 rounded-lg object-contain" />
        {m.texto && <p className="whitespace-pre-wrap">{m.texto}</p>}
      </div>
    );
  }
  if (m.tipo === "audio") return <audio controls src={m.media_url} className="h-10 max-w-full" />;
  if (m.tipo === "video") return <video controls src={m.media_url} className="max-h-64 max-w-full rounded-lg" />;

  return (
    <a
      href={m.media_url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      <FileText className="size-4 shrink-0" />
      {m.texto || "Documento"}
    </a>
  );
}

const ETIQUETA_ESTADO_MENSAJE: Record<string, string> = {
  enviando: "Enviando…",
  enviado: "Enviado",
  entregado: "Entregado",
  leido: "Leído",
  fallido: "No se pudo enviar",
  recibido: "",
};

export function WhatsappHilo({
  conversacion,
  mensajesIniciales,
  esCentral,
  comerciales,
  catalogoConectado,
}: {
  conversacion: ConversacionDetalle;
  mensajesIniciales: MensajeWhatsapp[];
  esCentral: boolean;
  comerciales: { id: string; nombre: string }[];
  catalogoConectado: boolean;
}) {
  const router = useRouter();
  // `key={conversacion.id}` en el padre (WhatsappConversacionPage) remonta
  // este componente entero al cambiar de conversación — así el estado inicial
  // siempre arranca de `mensajesIniciales` sin necesitar un efecto que lo
  // sincronice a mano (eso dispara un render de más y React lo señala).
  const [mensajes, setMensajes] = useState(mensajesIniciales);
  const [texto, setTexto] = useState("");
  const [enviando, startTransition] = useTransition();
  const [derivando, setDerivando] = useState(false);
  const [subiendoAdjunto, setSubiendoAdjunto] = useState(false);
  const [mostrarStickers, setMostrarStickers] = useState(false);
  // Los stickers se piden la primera vez que se abre el panel (Santos,
  // 21-09: que el chat cargue rápido), no al entrar a la conversación.
  const [stickers, setStickers] = useState<(Sticker & { url: string | null })[] | null>(null);
  function alternarStickers() {
    setMostrarStickers((v) => !v);
    setMostrarEquipos(false);
    if (stickers === null) stickersActivos().then(setStickers).catch(() => setStickers([]));
  }
  const [mostrarEquipos, setMostrarEquipos] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [segundosGrabados, setSegundosGrabados] = useState(0);
  const fondoRef = useRef<HTMLDivElement>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const grabadorRef = useRef<MediaRecorder | null>(null);
  const fragmentosRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cronometroRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const intervalo = setInterval(async () => {
      const frescos = await mensajesDe(conversacion.id);
      setMensajes(frescos);
    }, 4000);
    return () => clearInterval(intervalo);
  }, [conversacion.id]);

  useEffect(() => {
    fondoRef.current?.scrollTo({ top: fondoRef.current.scrollHeight });
  }, [mensajes.length]);

  const ventana = ventanaAbierta(conversacion.ultimo_mensaje_cliente_at);

  function enviar() {
    if (!texto.trim()) return;
    const textoAEnviar = texto;
    setTexto("");
    startTransition(async () => {
      const r = await enviarMensajeChat(conversacion.id, textoAEnviar);
      if (r.error) {
        toast.error(r.error);
        setTexto(textoAEnviar);
        return;
      }
      setMensajes(await mensajesDe(conversacion.id));
    });
  }

  async function elegirYEnviarArchivo(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_TAMANO_ADJUNTO_CHAT) {
      toast.error(`"${file.name}" pasa de 10 MB`);
      return;
    }
    setSubiendoAdjunto(true);
    try {
      const path = `whatsapp/${conversacion.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
      const { error: errorSubida } = await createClient().storage.from("adjuntos").upload(path, file, { contentType: file.type });
      if (errorSubida) {
        toast.error(`No se pudo subir "${file.name}": ${errorSubida.message}`);
        return;
      }
      const r = await enviarAdjuntoChat(conversacion.id, path, file.name, file.type);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setMensajes(await mensajesDe(conversacion.id));
    } finally {
      setSubiendoAdjunto(false);
    }
  }

  async function subirYEnviarBlob(blob: Blob, mime: string) {
    setSubiendoAdjunto(true);
    try {
      const extension = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
      const path = `whatsapp/${conversacion.id}/${crypto.randomUUID()}-audio.${extension}`;
      const { error: errorSubida } = await createClient().storage.from("adjuntos").upload(path, blob, { contentType: mime });
      if (errorSubida) {
        toast.error(`No se pudo subir el audio: ${errorSubida.message}`);
        return;
      }
      const r = await enviarAdjuntoChat(conversacion.id, path, `audio.${extension}`, mime);
      if (r.error) toast.error(r.error);
      setMensajes(await mensajesDe(conversacion.id));
    } finally {
      setSubiendoAdjunto(false);
    }
  }

  function pararCronometro() {
    if (cronometroRef.current) clearInterval(cronometroRef.current);
    cronometroRef.current = null;
  }

  function soltarMicrofono() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    grabadorRef.current = null;
    pararCronometro();
    setGrabando(false);
    setSegundosGrabados(0);
  }

  // Un clic empieza a grabar, otro clic para y manda — más simple y menos
  // propenso a error con mouse que "mantener presionado" (ese gesto es de
  // celular; WhatsApp Web para escritorio también usa clic-clic).
  async function empezarAGrabar() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("No se pudo acceder al micrófono. Revise los permisos del navegador.");
      return;
    }
    streamRef.current = stream;
    // Chrome/Edge solo arman el contenedor WebM (no Ogg, que es lo que Meta
    // prefiere para audio) — se manda igual; ver la nota en whatsapp.ts.
    const mime = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const grabador = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    fragmentosRef.current = [];
    grabador.ondataavailable = (e) => {
      if (e.data.size > 0) fragmentosRef.current.push(e.data);
    };
    grabador.onstop = () => {
      const blob = new Blob(fragmentosRef.current, { type: grabador.mimeType || "audio/webm" });
      soltarMicrofono();
      if (blob.size > 0) subirYEnviarBlob(blob, grabador.mimeType || "audio/webm");
    };
    grabadorRef.current = grabador;
    grabador.start();
    setGrabando(true);
    setSegundosGrabados(0);
    cronometroRef.current = setInterval(() => setSegundosGrabados((s) => s + 1), 1000);
  }

  function detenerYEnviarGrabacion() {
    grabadorRef.current?.stop(); // dispara onstop, que sube y manda
  }

  function cancelarGrabacion() {
    if (grabadorRef.current) {
      grabadorRef.current.onstop = null; // no mandar nada al parar por cancelar
      grabadorRef.current.stop();
    }
    soltarMicrofono();
  }

  // Solo al desmontar: suelta el micrófono si alguien navega a otra
  // conversación a mitad de una grabación.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => soltarMicrofono(), []);

  function enviarSticker(stickerId: string) {
    setMostrarStickers(false);
    startTransition(async () => {
      const r = await enviarStickerChat(conversacion.id, stickerId);
      if (r.error) toast.error(r.error);
      else setMensajes(await mensajesDe(conversacion.id));
    });
  }

  function derivar(comercialId: string) {
    startTransition(async () => {
      const r = await derivarConversacion(conversacion.id, comercialId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Derivado");
        setDerivando(false);
        router.refresh();
      }
    });
  }

  function cerrar() {
    startTransition(async () => {
      const r = await cerrarConversacion(conversacion.id);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  function reabrir() {
    startTransition(async () => {
      const r = await reabrirConversacion(conversacion.id);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{conversacion.nombre_wa || conversacion.telefono}</p>
          <p className="truncate text-xs text-muted-foreground">
            {conversacion.telefono}
            {conversacion.lead_codigo && ` · ${conversacion.lead_codigo}`}
            {conversacion.codigo_campania_wa && ` · código ${conversacion.codigo_campania_wa}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {esCentral && conversacion.estado !== "cerrada" && (
            <div className="relative">
              <Button size="sm" variant="outline" onClick={() => setDerivando((v) => !v)}>
                Derivar
              </Button>
              {derivando && (
                <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-border bg-card p-2 shadow-lg">
                  <Select<string> onValueChange={(v) => v && derivar(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Elija un comercial" />
                    </SelectTrigger>
                    <SelectContent>
                      {comerciales.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {conversacion.estado === "cerrada" ? (
            <Button size="sm" variant="outline" onClick={reabrir} disabled={enviando}>
              <RotateCcw className="size-3.5" /> Reabrir
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={cerrar} disabled={enviando}>
              <MessageCircleOff className="size-3.5" /> Cerrar
            </Button>
          )}
        </div>
      </div>

      <div ref={fondoRef} className="flex-1 space-y-2 overflow-y-auto bg-secondary/20 p-4">
        {mensajes.length === 0 && (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Sin mensajes todavía.</p>
        )}
        {mensajes.map((m) => (
          <div key={m.id} className={cn("flex", m.direccion === "saliente" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[75%] text-sm",
                m.tipo === "sticker"
                  ? "bg-transparent"
                  : cn("rounded-2xl px-3 py-2 shadow-sm", m.direccion === "saliente" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"),
              )}
            >
              <BurbujaContenido mensaje={m} />
              {/* El cliente pidió cotización o dijo «me interesa» (0250): el
                  atajo abre el cotizador con ese equipo ya en el renglón. Sin
                  oportunidad no hay dónde cotizar: Central tiene que derivar el
                  contacto desde la bandeja (eso crea la oportunidad). */}
              {m.direccion === "entrante" && m.tipo === "interactive" && m.equipo_sku && !m.equipo_sku.includes(",") && (
                conversacion.oportunidad_id ? (
                  <Link
                    href={`/comercial/oportunidades/${conversacion.oportunidad_id}/cotizar?sku=${encodeURIComponent(m.equipo_sku)}`}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <FileSpreadsheet className="size-3.5" /> Cotizar este equipo
                  </Link>
                ) : (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Para cotizar, Central debe derivar {conversacion.lead_codigo ?? "el contacto"} desde la bandeja: eso abre la oportunidad.
                  </p>
                )
              )}
              <div
                className={cn(
                  "mt-1 flex items-center gap-1.5 text-[10px] opacity-70",
                  m.tipo === "sticker" ? "justify-start text-muted-foreground" : "justify-end",
                )}
              >
                {m.enviado_por_nombre && <span>{m.enviado_por_nombre} · </span>}
                <span>{fechaHoraLima(m.timestamp_meta ?? m.created_at)}</span>
                {m.direccion === "saliente" && ETIQUETA_ESTADO_MENSAJE[m.estado] && <span>· {ETIQUETA_ESTADO_MENSAJE[m.estado]}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3">
        {conversacion.estado === "cerrada" ? (
          <p className="text-center text-xs text-muted-foreground">Conversación cerrada. Reábrala para seguir escribiendo.</p>
        ) : !ventana ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-center text-xs text-amber-900">
            La ventana de 24 h se cerró: por ahora no se puede mandar texto libre (las plantillas aprobadas son fase 3).
          </p>
        ) : (
          // Una sola píldora, como WhatsApp Web (Santos, 15-09, con captura de
          // referencia): clip, sticker, el cuadro de texto sin borde propio, y
          // el micrófono/enviar al final — todo dentro del mismo contorno, sin
          // que cada botón se vea como una caja aparte.
          <div className="flex items-end gap-1.5 rounded-3xl border border-input bg-card px-2 py-1.5 shadow-sm">
            <input
              ref={inputArchivoRef}
              type="file"
              accept={ACEPTA_ADJUNTOS_CHAT}
              className="hidden"
              onChange={(e) => {
                elegirYEnviarArchivo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => inputArchivoRef.current?.click()}
              disabled={enviando || subiendoAdjunto || grabando}
              title="Adjuntar foto, documento, audio o video"
            >
              {subiendoAdjunto ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            </Button>

            <div className="relative shrink-0">
              <Button
                size="icon-sm"
                variant="ghost"
                className="rounded-full text-muted-foreground hover:text-foreground"
                onClick={alternarStickers}
                disabled={enviando || grabando}
                title="Enviar un sticker de la empresa"
              >
                <StickerIcon className="size-4" />
              </Button>
              {mostrarStickers && (
                <div className="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-md border border-border bg-card p-2 shadow-lg">
                  {stickers === null ? (
                    <p className="flex items-center gap-1.5 p-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Cargando stickers…
                    </p>
                  ) : stickers.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">
                      Todavía no hay stickers cargados — se cargan en Gerencia → Panel de marketing → WhatsApp.
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {stickers.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => enviarSticker(s.id)}
                          title={s.nombre}
                          className="cursor-pointer rounded-md p-1 hover:bg-secondary"
                        >
                          {s.url && (
                            // eslint-disable-next-line @next/next/no-img-element -- miniatura firmada de Storage
                            <img src={s.url} alt={s.nombre} className="size-12 object-contain" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="relative shrink-0">
              <Button
                size="icon-sm"
                variant="ghost"
                className={cn("rounded-full text-muted-foreground hover:text-foreground", mostrarEquipos && "bg-secondary text-foreground")}
                onClick={() => {
                  setMostrarEquipos((v) => !v);
                  setMostrarStickers(false);
                }}
                disabled={enviando || grabando}
                title="Mandar un equipo del catálogo (ficha con botones)"
              >
                <Package className="size-4" />
              </Button>
              {mostrarEquipos && (
                <WhatsappMandarEquipo
                  conversacionId={conversacion.id}
                  catalogoConectado={catalogoConectado}
                  onCerrar={() => setMostrarEquipos(false)}
                  onEnviado={async () => {
                    setMostrarEquipos(false);
                    setMensajes(await mensajesDe(conversacion.id));
                  }}
                />
              )}
            </div>

            {grabando ? (
              <div className="flex flex-1 items-center gap-2 px-1.5 py-1">
                <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
                <span className="flex-1 text-sm font-medium tabular-nums text-red-700">
                  Grabando… {String(Math.floor(segundosGrabados / 60)).padStart(2, "0")}:{String(segundosGrabados % 60).padStart(2, "0")}
                </span>
                <Button size="icon-sm" variant="ghost" className="rounded-full" onClick={cancelarGrabacion} title="Cancelar">
                  <Trash2 className="size-4 text-red-600" />
                </Button>
              </div>
            ) : (
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                placeholder="Escriba un mensaje"
                rows={1}
                className="min-h-0 flex-1 resize-none border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0"
                disabled={enviando}
              />
            )}

            {grabando ? (
              <Button size="icon-sm" className="shrink-0 rounded-full" onClick={detenerYEnviarGrabacion} title="Detener y enviar">
                <Send className="size-4" />
              </Button>
            ) : texto.trim() ? (
              <Button size="icon-sm" className="shrink-0 rounded-full" onClick={enviar} disabled={enviando}>
                <Send className="size-4" />
              </Button>
            ) : (
              <Button
                size="icon-sm"
                variant="ghost"
                className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={empezarAGrabar}
                disabled={enviando || subiendoAdjunto}
                title="Grabar un audio"
              >
                <Mic className="size-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
