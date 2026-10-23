"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Loader2, Lock, MessageCircle, Minus, SendHorizontal, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cargarChat, enviarMensajeChat, type DatosChat } from "@/lib/acciones/chat";
import { AREAS_CHAT, chatDelEnlace, type AreaChat, type TipoChat } from "@/lib/chat";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit" });

/** Abre el chat de un caso o pedido encima de la pantalla actual (desde el mapa, la campana o un botón). */
export function abrirChat(tipo: TipoChat, id: string, para: AreaChat | null = null): void {
  window.dispatchEvent(new CustomEvent("crm:abrir-chat", { detail: { tipo, id, para } }));
}

/** El chat que está abierto ahora (para no avisar con una ventanita lo que ya se ve en la conversación). */
let abiertoAhora: string | null = null;
export function chatEstaAbierto(url: string): boolean {
  const c = chatDelEnlace(url);
  return Boolean(c && abiertoAhora === `${c.tipo}:${c.id}`);
}

/** Si un enlace trae «#chat=…», abre ese chat y dice que lo hizo. */
export function abrirChatDelEnlace(url: string): boolean {
  const c = chatDelEnlace(url);
  if (!c) return false;
  abrirChat(c.tipo, c.id);
  return true;
}

/**
 * EL CHAT DEL CASO, COMO UNA VENTANA DE MESSENGER (Santos, 23-10: «que cada
 * caso tenga su propio canal de chat con los involucrados hasta que se cierre
 * el caso»). Flota abajo a la derecha sobre cualquier pantalla: no saca a nadie
 * de lo que estaba haciendo, se minimiza a una pastilla y se cierra. Los
 * mensajes llegan al instante por el canal en vivo del CRM local y, de
 * respaldo, se pone al día cada pocos segundos. Cerrado el caso, queda de solo
 * lectura.
 */
export function ChatFlotante() {
  const [abierto, setAbierto] = useState<{ tipo: TipoChat; id: string; para: AreaChat | null } | null>(null);
  const [minimizado, setMinimizado] = useState(false);

  useEffect(() => {
    const abrir = (ev: Event) => {
      const d = (ev as CustomEvent<{ tipo: TipoChat; id: string; para: AreaChat | null }>).detail;
      setAbierto(d);
      setMinimizado(false);
    };
    const desdeEnlace = () => {
      const c = chatDelEnlace(window.location.hash);
      if (!c) return;
      setAbierto({ ...c, para: null });
      setMinimizado(false);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    desdeEnlace();
    window.addEventListener("crm:abrir-chat", abrir);
    window.addEventListener("hashchange", desdeEnlace);
    return () => {
      window.removeEventListener("crm:abrir-chat", abrir);
      window.removeEventListener("hashchange", desdeEnlace);
    };
  }, []);

  // Avisa si el chat ocupa la esquina de abajo a la derecha: la bolita de Efamein se aparta (Santos 23-10).
  const visible = abierto !== null;
  useEffect(() => {
    (window as unknown as { __crmChatVisible?: boolean }).__crmChatVisible = visible;
    window.dispatchEvent(new CustomEvent("crm:chat-visible", { detail: { visible } }));
  }, [visible]);

  if (!abierto) return null;
  // Al cuerpo de la página: la campana vive en la barra de arriba, cuyo desenfoque rompe el «fixed» (23-10).
  return createPortal(
    <VentanaChat
      key={`${abierto.tipo}:${abierto.id}:${abierto.para ?? ""}`}
      tipo={abierto.tipo}
      id={abierto.id}
      paraInicial={abierto.para}
      minimizado={minimizado}
      alMinimizar={setMinimizado}
      alCerrar={() => setAbierto(null)}
    />,
    document.body,
  );
}

function VentanaChat({
  tipo,
  id,
  paraInicial,
  minimizado,
  alMinimizar,
  alCerrar,
}: {
  tipo: TipoChat;
  id: string;
  paraInicial: AreaChat | null;
  minimizado: boolean;
  alMinimizar: (v: boolean) => void;
  alCerrar: () => void;
}) {
  const [datos, setDatos] = useState<DatosChat | null>(null);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [para, setPara] = useState<AreaChat | "">(paraInicial ?? "");
  const [verInvolucrados, setVerInvolucrados] = useState(false);
  const [enviando, empezar] = useTransition();
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    abiertoAhora = minimizado ? null : `${tipo}:${id}`;
    return () => {
      abiertoAhora = null;
    };
  }, [tipo, id, minimizado]);

  const recargar = useCallback(async () => {
    const d = await cargarChat(tipo, id).catch(() => null);
    setCargando(false);
    if (d) {
      setDatos(d);
      // Leído: el contador del botón «Chat del caso» se apaga sin recargar la pantalla.
      window.dispatchEvent(new CustomEvent("crm:chat-leido", { detail: { tipo, id } }));
    }
  }, [tipo, id]);

  // Primera carga y puesta al día: al instante por el canal en vivo (si está), y cada pocos segundos de respaldo.
  useEffect(() => {
    const primera = window.setTimeout(() => void recargar(), 0);
    const enVivo = process.env.NEXT_PUBLIC_CAMPANA_EN_VIVO === "1";
    const reloj = window.setInterval(() => {
      if (document.visibilityState === "visible") void recargar();
    }, enVivo ? 15_000 : 4_000);
    let soltar: (() => void) | null = null;
    if (enVivo) {
      const supabase = createClient();
      const canal = supabase
        .channel(`chat-${tipo}-${id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_mensajes", filter: `${tipo === "caso" ? "atencion_id" : "servicio_id"}=eq.${id}` }, () => void recargar())
        .subscribe();
      soltar = () => void supabase.removeChannel(canal);
    }
    return () => {
      window.clearTimeout(primera);
      window.clearInterval(reloj);
      soltar?.();
    };
  }, [recargar, tipo, id]);

  // Siempre a la vista el último mensaje.
  const total = datos?.mensajes.length ?? 0;
  useLayoutEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [total, minimizado]);
  useEffect(() => {
    if (!minimizado && !cargando) campo.current?.focus();
  }, [minimizado, cargando]);

  const cerrado = Boolean(datos?.cerradoAt);

  function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    empezar(async () => {
      const r = await enviarMensajeChat({ tipo, id, texto: t, para: para || null });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setTexto("");
      await recargar();
    });
  }

  if (minimizado) {
    return (
      <button
        type="button"
        onClick={() => alMinimizar(false)}
        className="fixed right-4 bottom-4 z-40 inline-flex max-w-[18rem] items-center gap-2 truncate rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-xl"
      >
        <MessageCircle className="size-4 shrink-0" />
        <span className="truncate">{datos?.titulo ?? "Chat"}</span>
      </button>
    );
  }

  return (
    <section
      aria-label="Chat del caso"
      className="fixed inset-x-2 bottom-2 z-40 flex h-[min(34rem,calc(100dvh-5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[23rem]"
    >
      <header className="flex items-start gap-2 bg-primary px-3 py-2.5 text-primary-foreground">
        <MessageCircle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{datos?.titulo ?? "Chat"}</p>
          <button
            type="button"
            onClick={() => setVerInvolucrados((v) => !v)}
            aria-expanded={verInvolucrados}
            className="block w-full truncate text-left text-[11px] opacity-85 hover:underline"
            title="Ver todos los involucrados"
          >
            {datos?.participantes.length
              ? `${datos.participantes.length} involucrado${datos.participantes.length === 1 ? "" : "s"}: ${datos.participantes.map((p) => `${p.nombre.split(" ")[0]}${p.area ? ` (${p.area})` : ""}`).join(", ")}`
              : `Chat de todos los involucrados del ${tipo === "caso" ? "caso" : "pedido"}`}
          </button>
        </div>
        <button type="button" onClick={() => alMinimizar(true)} className="rounded p-1 hover:bg-white/15" aria-label="Minimizar el chat">
          <Minus className="size-4" />
        </button>
        <button type="button" onClick={alCerrar} className="rounded p-1 hover:bg-white/15" aria-label="Cerrar el chat">
          <X className="size-4" />
        </button>
      </header>

      {verInvolucrados && datos && (
        <div className="max-h-40 overflow-y-auto border-b border-border bg-card px-3 py-2 text-xs">
          <p className="mb-1 font-semibold text-foreground">Involucrados: a todos les llega cada mensaje</p>
          <ul className="flex flex-wrap gap-1">
            {datos.participantes.map((p, i) => (
              <li key={`${p.nombre}-${i}`} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-foreground">
                {p.nombre}
                {p.area ? <span className="text-muted-foreground"> · {p.area}</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-muted-foreground">Quien lleva el caso, quien movió algún paso, quien apuró o escribió. «Para» suma a un área entera.</p>
        </div>
      )}
      <div ref={lista} className="flex-1 space-y-2 overflow-y-auto bg-secondary/30 px-3 py-3">
        {cargando ? (
          <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando la conversación…
          </p>
        ) : !datos ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No tiene acceso a este chat.</p>
        ) : datos.mensajes.length === 0 ? (
          <div className="mx-auto max-w-[17rem] py-8 text-center text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Todavía no hay mensajes</p>
            <p className="mt-1">
              Es el canal de todos los involucrados en este {tipo === "caso" ? "caso" : "pedido"}: cada mensaje les llega a todos. Si lo tiene que mover un área en particular, elíjala en «Para» y también le llega a ella.
            </p>
          </div>
        ) : (
          datos.mensajes.map((m, i) => {
            const dia = fechaLima(m.at);
            const otroDia = i === 0 || fechaLima(datos.mensajes[i - 1].at) !== dia;
            const seguido = !otroDia && i > 0 && datos.mensajes[i - 1].autor === m.autor && datos.mensajes[i - 1].clase === "mensaje";
            return (
              <div key={m.id}>
                {otroDia && <p className="my-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{dia}</p>}
                {m.clase === "apuro" ? (
                  <p className="mx-auto w-fit max-w-[90%] rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-center text-[11px] text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
                    📳 <b>{m.autor}</b> apuró{m.para ? ` a ${AREAS_CHAT[m.para]}` : ""}: {m.texto}
                    <span className="ml-1 opacity-70">{hora(m.at)}</span>
                  </p>
                ) : (
                  <div className={cn("flex flex-col", m.mio ? "items-end" : "items-start")}>
                    {!seguido && !m.mio && (
                      <span className="mb-0.5 px-1 text-[10px] font-semibold text-muted-foreground">
                        {m.autor}
                        {m.area ? ` · ${m.area}` : ""}
                      </span>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug whitespace-pre-wrap break-words shadow-sm",
                        m.mio ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card text-foreground ring-1 ring-border",
                      )}
                    >
                      {m.para && <span className={cn("mb-0.5 block text-[10px] font-semibold", m.mio ? "opacity-80" : "text-primary")}>Para {AREAS_CHAT[m.para]}</span>}
                      {m.texto}
                    </div>
                    <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">{hora(m.at)}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {cerrado ? (
        <p className="flex items-center gap-2 border-t border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          {tipo === "caso" ? "El caso" : "El pedido"} se cerró{datos?.cerradoAt ? ` el ${fechaLima(datos.cerradoAt)}` : ""}: la conversación queda como constancia, de solo lectura.
        </p>
      ) : (
        <form
          className="space-y-1.5 border-t border-border bg-card p-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Para:
            <select
              value={para}
              onChange={(e) => setPara(e.target.value as AreaChat | "")}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
            >
              <option value="">Todos los involucrados</option>
              {(Object.keys(AREAS_CHAT) as AreaChat[])
                .filter((a) => a !== "comercial" || tipo === "pedido")
                .map((a) => (
                  <option key={a} value={a}>
                    {AREAS_CHAT[a]} (y a todos los involucrados)
                  </option>
                ))}
            </select>
          </label>
          <div className="flex items-end gap-1.5">
            <textarea
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              rows={Math.min(4, Math.max(1, texto.split("\n").length))}
              maxLength={2000}
              placeholder="Escriba un mensaje… (Enter envía)"
              title="Enter envía · Mayús + Enter salta de línea"
              className="min-h-9 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!texto.trim() || enviando}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              aria-label="Enviar"
            >
              {enviando ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
