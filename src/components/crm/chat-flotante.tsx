"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition, type PointerEvent as EventoPuntero } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AtSign, CheckCheck, Loader2, Lock, Maximize2, MessageCircle, Minimize2, Minus, SendHorizontal, UserPlus, UserX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { agregarAlChat, buscarPersonasChat, cargarChat, enviarMensajeChat, type DatosChat } from "@/lib/acciones/chat";
import { AREAS_CHAT, chatDelEnlace, diasSinEntrar, mencionesEnElTexto, partirMenciones, type TipoChat } from "@/lib/chat";
import { refrescarMisChats } from "@/lib/mis-chats";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit" });

/** Abre el chat de un caso o pedido encima de la pantalla actual (desde el mapa, la campana o un botón). */
export function abrirChat(tipo: TipoChat, id: string): void {
  window.dispatchEvent(new CustomEvent("crm:abrir-chat", { detail: { tipo, id } }));
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
 * EL CANAL DE COORDINACIÓN DEL CASO (Santos, 23-10): «es como un pequeño chat
 * de Slack», de todos con todos los involucrados, hasta que se cierra el caso.
 * Flota abajo a la derecha sobre cualquier pantalla: no saca a nadie de lo que
 * estaba haciendo, se minimiza a una pastilla, se agranda desde la esquina de
 * arriba a la izquierda o se maximiza. «Agregar a…» suma a quien no está por
 * defecto (gerencia, administración, Central…) para destrabar. Cada mensaje
 * dice quién y a qué hora, y quiénes ya lo vieron. Cerrado el caso, solo
 * lectura; el historial queda guardado.
 */
export function ChatFlotante() {
  const [abierto, setAbierto] = useState<{ tipo: TipoChat; id: string } | null>(null);
  const [minimizado, setMinimizado] = useState(false);

  useEffect(() => {
    const abrir = (ev: Event) => {
      const d = (ev as CustomEvent<{ tipo: TipoChat; id: string }>).detail;
      setAbierto({ tipo: d.tipo, id: d.id });
      setMinimizado(false);
    };
    const desdeEnlace = () => {
      const c = chatDelEnlace(window.location.hash);
      if (!c) return;
      setAbierto(c);
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
      key={`${abierto.tipo}:${abierto.id}`}
      tipo={abierto.tipo}
      id={abierto.id}
      minimizado={minimizado}
      alMinimizar={setMinimizado}
      alCerrar={() => setAbierto(null)}
    />,
    document.body,
  );
}

const CLAVE_TAMANO = "crm:chat-caso-tamano";
const TAMANO_INICIAL = { w: 420, h: 600 };
const MINIMO = { w: 320, h: 380 };

/** El tamaño que eligió cada persona, dentro de la pantalla. */
function tamanoGuardado(): { w: number; h: number } {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_TAMANO) ?? "null");
    if (g && typeof g.w === "number" && typeof g.h === "number") return g;
  } catch {
    // Sin almacenamiento: el tamaño de siempre.
  }
  return TAMANO_INICIAL;
}

function VentanaChat({
  tipo,
  id,
  minimizado,
  alMinimizar,
  alCerrar,
}: {
  tipo: TipoChat;
  id: string;
  minimizado: boolean;
  alMinimizar: (v: boolean) => void;
  alCerrar: () => void;
}) {
  const [datos, setDatos] = useState<DatosChat | null>(null);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [panel, setPanel] = useState<"" | "miembros" | "agregar">("");
  const [enviando, empezar] = useTransition();
  const [tamano, setTamano] = useState(tamanoGuardado);
  const [maximo, setMaximo] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const minimizadoRef = useRef(minimizado);
  // EL «@» (Santos 23-10): a quiénes se eligió al escribir, y la lista que se abre al teclear «@».
  const [elegidas, setElegidas] = useState<{ id: string; nombre: string }[]>([]);
  const [arroba, setArroba] = useState<{ desde: number; q: string } | null>(null);
  const [opcionArroba, setOpcionArroba] = useState(0);
  const [otrasPersonas, setOtrasPersonas] = useState<{ id: string; nombre: string; area: string }[]>([]);
  const primeraCarga = useRef(true);
  const [verAusentes, setVerAusentes] = useState(false);

  useEffect(() => {
    minimizadoRef.current = minimizado;
    abiertoAhora = minimizado ? null : `${tipo}:${id}`;
    return () => {
      abiertoAhora = null;
    };
  }, [tipo, id, minimizado]);

  // Leer con la ventana abierta y a la vista es «visto»; minimizada o en otra pestaña, no.
  const recargar = useCallback(async () => {
    const aLaVista = !minimizadoRef.current && document.visibilityState === "visible";
    // La primera vez se rehace la lista de quiénes están en el canal (0599): un paso movido suma gente.
    const sincronizar = primeraCarga.current;
    primeraCarga.current = false;
    const d = await cargarChat(tipo, id, aLaVista, sincronizar).catch(() => null);
    setCargando(false);
    if (d) {
      setDatos(d);
      // Leído: el contador del botón «Chat del caso» se apaga sin recargar la pantalla.
      if (aLaVista) window.dispatchEvent(new CustomEvent("crm:chat-leido", { detail: { tipo, id } }));
    }
  }, [tipo, id]);

  // Primera carga y puesta al día: al instante por el canal en vivo (si está), y cada pocos segundos de respaldo.
  useEffect(() => {
    const primera = window.setTimeout(() => void recargar(), 0);
    const enVivo = process.env.NEXT_PUBLIC_CAMPANA_EN_VIVO === "1";
    const reloj = window.setInterval(() => {
      if (document.visibilityState === "visible") void recargar();
    }, enVivo ? 10_000 : 4_000);
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

  // Al volver de minimizado se marca como visto.
  useEffect(() => {
    if (minimizado) return;
    const t = window.setTimeout(() => void recargar(), 0);
    return () => window.clearTimeout(t);
  }, [minimizado, recargar]);

  // Siempre a la vista el último mensaje.
  const total = datos?.mensajes.length ?? 0;
  useLayoutEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [total, minimizado, maximo]);
  useEffect(() => {
    if (!minimizado && !cargando && panel !== "agregar") campo.current?.focus();
  }, [minimizado, cargando, panel]);

  // AGRANDAR DESDE LA ESQUINA (Santos 23-10: «una ventana más flexible»): está anclada abajo a la derecha, así que crece hacia arriba y a la izquierda.
  const arrastre = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  function alBajarEsquina(e: EventoPuntero<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { x: e.clientX, y: e.clientY, w: tamano.w, h: tamano.h };
    setMaximo(false);
  }
  function alMoverEsquina(e: EventoPuntero<HTMLDivElement>) {
    const a = arrastre.current;
    if (!a) return;
    setTamano({
      w: Math.round(Math.min(window.innerWidth - 32, Math.max(MINIMO.w, a.w + (a.x - e.clientX)))),
      h: Math.round(Math.min(window.innerHeight - 32, Math.max(MINIMO.h, a.h + (a.y - e.clientY)))),
    });
  }
  function alSoltarEsquina() {
    if (!arrastre.current) return;
    arrastre.current = null;
    try {
      localStorage.setItem(CLAVE_TAMANO, JSON.stringify(tamano));
    } catch {
      // Sin almacenamiento: el tamaño vale para esta vez.
    }
  }

  const cerrado = Boolean(datos?.cerradoAt);

  // Quiénes se pueden nombrar: primero los del canal; con dos letras, también cualquiera del CRM (entra al canal al nombrarlo).
  const yoId = datos?.participantes.find((p) => p.yo)?.id ?? null;
  const normal = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const delCanal = (datos?.participantes ?? []).filter((p) => !p.yo && (!arroba || normal(p.nombre).includes(normal(arroba.q))));
  const candidatos = [
    ...delCanal.map((p) => ({ id: p.id, nombre: p.nombre, area: p.area, fuera: false })),
    ...otrasPersonas
      .filter((p) => p.id !== yoId && !(datos?.participantes ?? []).some((x) => x.id === p.id))
      .map((p) => ({ id: p.id, nombre: p.nombre.replace(/\s*\([^)]*\)$/, ""), area: p.area, fuera: true })),
  ].slice(0, 8);

  const qArroba = arroba?.q.trim() ?? "";
  useEffect(() => {
    let vigente = true;
    const t = window.setTimeout(
      async () => {
        const r = qArroba.length < 2 ? [] : await buscarPersonasChat(qArroba).catch(() => []);
        if (vigente) setOtrasPersonas(r);
      },
      qArroba.length < 2 ? 0 : 250,
    );
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [qArroba]);

  /** Mira si quien escribe está tecleando un «@algo» justo antes del cursor. */
  function alEscribir(valor: string, cursor: number) {
    setTexto(valor);
    const antes = valor.slice(0, cursor);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(antes);
    if (m) {
      setArroba({ desde: cursor - m[2].length - 1, q: m[2] });
      setOpcionArroba(0);
    } else setArroba(null);
  }

  /** Cambia «@algo» por «@Nombre Apellido » y la recuerda para mandarla con el mensaje. */
  function nombrar(p: { id: string; nombre: string }) {
    if (!arroba) return;
    const cursor = campo.current?.selectionStart ?? texto.length;
    const nuevo = `${texto.slice(0, arroba.desde)}@${p.nombre} ${texto.slice(cursor)}`;
    setTexto(nuevo);
    setElegidas((e) => (e.some((x) => x.id === p.id) ? e : [...e, { id: p.id, nombre: p.nombre }]));
    setArroba(null);
    const pos = arroba.desde + p.nombre.length + 2;
    window.setTimeout(() => {
      campo.current?.focus();
      campo.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  // QUIÉN NO ENTRA AL CRM (0599): si un involucrado no entra hace dos días o más, quien escribe sabe que hoy toca llamarlo.
  const ausentes = (datos?.participantes ?? [])
    .filter((p) => !p.yo)
    .map((p) => ({ ...p, dias: diasSinEntrar(p.ultimoAcceso) }))
    .filter((p) => p.dias === null || p.dias >= 2);

  function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    empezar(async () => {
      const r = await enviarMensajeChat({ tipo, id, texto: t, menciones: mencionesEnElTexto(t, elegidas) });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setTexto("");
      setElegidas([]);
      setArroba(null);
      await recargar();
      refrescarMisChats();
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

  const enCanal = datos?.participantes.length ?? 0;
  return (
    <section
      aria-label="Chat del caso"
      style={{ ["--chat-w" as string]: `${maximo ? 900 : tamano.w}px`, ["--chat-h" as string]: `${maximo ? 2000 : tamano.h}px` }}
      className="fixed inset-x-2 bottom-2 z-40 flex h-[min(38rem,calc(100dvh-5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:h-[min(var(--chat-h),calc(100dvh-2rem))] sm:w-[min(var(--chat-w),calc(100vw-2rem))]"
    >
      {/* La esquina para agrandar (escritorio). */}
      <div
        onPointerDown={alBajarEsquina}
        onPointerMove={alMoverEsquina}
        onPointerUp={alSoltarEsquina}
        onPointerCancel={alSoltarEsquina}
        title="Arrastre para agrandar o achicar"
        className="absolute top-0 left-0 z-10 hidden size-4 cursor-nwse-resize touch-none sm:block"
      >
        <span className="absolute top-1 left-1 size-2 rounded-tl border-t-2 border-l-2 border-white/70" />
      </div>
      <header className="flex items-start gap-2 bg-primary px-3 py-2.5 text-primary-foreground">
        <MessageCircle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{datos?.titulo ?? "Chat"}</p>
          <button
            type="button"
            onClick={() => setPanel((p) => (p === "miembros" ? "" : "miembros"))}
            aria-expanded={panel === "miembros"}
            className="block w-full truncate text-left text-[11px] opacity-85 hover:underline"
            title="Ver quiénes están en el canal"
          >
            {enCanal
              ? `${enCanal} en el canal: ${datos!.participantes.map((p) => (p.yo ? "usted" : p.nombre.split(" ")[0])).join(", ")}`
              : `Canal de coordinación del ${tipo === "caso" ? "caso" : "pedido"}`}
          </button>
        </div>
        {!cerrado && (
          <button type="button" onClick={() => setPanel((p) => (p === "agregar" ? "" : "agregar"))} className="rounded p-1 hover:bg-white/15" aria-label="Agregar a alguien al chat" title="Agregar a alguien (gerencia, administración, Central…)">
            <UserPlus className="size-4" />
          </button>
        )}
        <button type="button" onClick={() => setMaximo((m) => !m)} className="hidden rounded p-1 hover:bg-white/15 sm:block" aria-label={maximo ? "Volver al tamaño anterior" : "Agrandar el chat"} title={maximo ? "Volver al tamaño anterior" : "Agrandar"}>
          {maximo ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button type="button" onClick={() => alMinimizar(true)} className="rounded p-1 hover:bg-white/15" aria-label="Minimizar el chat">
          <Minus className="size-4" />
        </button>
        <button type="button" onClick={alCerrar} className="rounded p-1 hover:bg-white/15" aria-label="Cerrar el chat">
          <X className="size-4" />
        </button>
      </header>

      {panel === "miembros" && datos && (
        <div className="max-h-48 overflow-y-auto border-b border-border bg-card px-3 py-2 text-xs">
          <p className="mb-1 font-semibold text-foreground">En el canal: a todos les llega cada mensaje</p>
          <ul className="flex flex-wrap gap-1">
            {datos.participantes.map((p) => (
              <li key={p.id} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-foreground" title={p.agregadoPor ? `Lo agregó ${p.agregadoPor}` : undefined}>
                {p.yo ? `${p.nombre} (usted)` : p.nombre}
                {p.area ? <span className="text-muted-foreground"> · {p.area}</span> : null}
                {p.agregadoPor ? <span className="text-primary"> · agregado</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Están quien lleva el caso, quien movió algún paso, quien apuró o escribió y quienes se agregaron.{" "}
            {!cerrado && (
              <button type="button" onClick={() => setPanel("agregar")} className="font-semibold text-primary hover:underline">
                Agregar a alguien
              </button>
            )}
          </p>
        </div>
      )}

      {panel === "agregar" && !cerrado && (
        <AgregarPersona
          tipo={tipo}
          id={id}
          yaEstan={new Set(datos?.participantes.map((p) => p.id) ?? [])}
          alAgregar={async () => {
            await recargar();
          }}
          alCerrar={() => setPanel("")}
        />
      )}

      <div ref={lista} className="flex-1 space-y-2.5 overflow-y-auto bg-secondary/30 px-3 py-3">
        {cargando ? (
          <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando la conversación…
          </p>
        ) : !datos ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No tiene acceso a este chat.</p>
        ) : datos.mensajes.length === 0 ? (
          <div className="mx-auto max-w-[18rem] py-8 text-center text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Todavía no hay mensajes</p>
            <p className="mt-1">
              Es el canal de coordinación de todos los involucrados en este {tipo === "caso" ? "caso" : "pedido"}: cada mensaje les llega a todos. Si hace falta alguien que no
              está (gerencia, administración, Central…), súmelo con el botón <UserPlus className="inline size-3.5" /> de arriba.
            </p>
          </div>
        ) : (
          datos.mensajes.map((m, i) => {
            const dia = fechaLima(m.at);
            const otroDia = i === 0 || fechaLima(datos.mensajes[i - 1].at) !== dia;
            return (
              <div key={m.id}>
                {otroDia && <p className="my-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{dia}</p>}
                {m.clase === "sistema" ? (
                  <p className="mx-auto w-fit max-w-[90%] rounded-full bg-secondary px-3 py-1 text-center text-[11px] text-muted-foreground">
                    {m.texto} · {hora(m.at)}
                  </p>
                ) : m.clase === "apuro" ? (
                  <div className="mx-auto w-fit max-w-[92%] text-center">
                    <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
                      📳 <b>{m.autor}</b> apuró{m.para ? ` a ${AREAS_CHAT[m.para]}` : ""} · {hora(m.at)}
                      <span className="mt-0.5 block">{m.texto}</span>
                    </p>
                    <Visto m={m} />
                  </div>
                ) : (
                  <div className={cn("flex flex-col", m.mio ? "items-end" : "items-start")}>
                    {/* Cada mensaje con nombre y hora (Santos 23-10). */}
                    <span className="mb-0.5 px-1 text-[10px] text-muted-foreground">
                      <b className="font-semibold text-foreground/80">{m.mio ? "Usted" : m.autor}</b>
                      {!m.mio && m.area ? ` · ${m.area}` : ""} · {hora(m.at)}
                    </span>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug whitespace-pre-wrap break-words shadow-sm",
                        m.mio ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card text-foreground ring-1 ring-border",
                        m.meMenciona && "ring-2 ring-amber-400",
                      )}
                    >
                      {/* «@Nombre» resaltado (0599). */}
                      {partirMenciones(m.texto, m.menciones).map((t, k) =>
                        t.mencion ? (
                          <b key={k} className={cn("rounded px-0.5 font-semibold", m.mio ? "bg-white/20" : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100")}>
                            {t.texto}
                          </b>
                        ) : (
                          <span key={k}>{t.texto}</span>
                        ),
                      )}
                    </div>
                    <Visto m={m} />
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
          {tipo === "caso" ? "El caso" : "El pedido"} se cerró{datos?.cerradoAt ? ` el ${fechaLima(datos.cerradoAt)}` : ""}: el canal terminó y la conversación queda guardada, de solo lectura.
        </p>
      ) : (
        <>
        {ausentes.length > 0 && (
          <button
            type="button"
            onClick={() => setVerAusentes((v) => !v)}
            className="flex w-full items-start gap-1.5 border-t border-border bg-amber-50 px-3 py-1.5 text-left text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <UserX className="mt-px size-3.5 shrink-0" />
            <span>
              {ausentes.length <= 2 || verAusentes
                ? ausentes.map((p) => (p.ultimoAcceso ? `${p.nombre} no entra al CRM desde el ${fechaLima(p.ultimoAcceso)}` : `${p.nombre} nunca entró al CRM`)).join(" · ")
                : `${ausentes.length} del canal no entran al CRM hace días: ${ausentes.map((p) => p.nombre.split(" ")[0]).join(", ")} (ver detalle)`}
              . Si es urgente, {ausentes.length > 1 ? "llámelos" : "llámelo"}.
            </span>
          </button>
        )}
        {arroba && candidatos.length > 0 && (
          <ul className="max-h-48 overflow-y-auto border-t border-border bg-card py-1 text-xs" role="listbox" aria-label="Nombrar a alguien">
            {candidatos.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === opcionArroba}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    nombrar(p);
                  }}
                  className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left", i === opcionArroba ? "bg-accent" : "hover:bg-secondary")}
                >
                  <AtSign className="size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{p.nombre}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{p.fuera ? "no está en el canal: entra al nombrarlo" : p.area}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex items-end gap-1.5 border-t border-border bg-card p-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => alEscribir(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={(e) => {
              // Con la lista del «@» abierta, las flechas eligen y Enter / Tab nombra.
              if (arroba && candidatos.length > 0) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setOpcionArroba((i) => (i + (e.key === "ArrowDown" ? 1 : candidatos.length - 1)) % candidatos.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  nombrar(candidatos[Math.min(opcionArroba, candidatos.length - 1)]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setArroba(null);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            rows={Math.min(5, Math.max(1, texto.split("\n").length))}
            maxLength={2000}
            placeholder="Escriba al canal… (@ para nombrar a alguien)"
            title="Enter envía · Mayús + Enter salta de línea · @ nombra a alguien y le llega su aviso"
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
        </form>
        </>
      )}
    </section>
  );
}

/**
 * «Visto por…»: quiénes ya leyeron el mensaje, con NOMBRE COMPLETO (Santos
 * 23-10: «debe estar el visto de las personas que lo vieron con nombre»), y
 * quiénes del canal todavía no. Con muchos, se abre tocándolo (también en el celular).
 */
function Visto({ m }: { m: DatosChat["mensajes"][number] }) {
  const [abierto, setAbierto] = useState(false);
  const n = m.vistos.length;
  const largo = n + m.sinVer.length > 3;
  const vistos = !largo || abierto ? m.vistos.join(", ") : `${m.vistos.slice(0, 2).join(", ")}${n > 2 ? ` y ${n - 2} más` : ""}`;
  return (
    <button
      type="button"
      onClick={() => largo && setAbierto((v) => !v)}
      className={cn("mt-0.5 inline-flex max-w-[92%] items-start gap-1 px-1 text-left text-[10px]", largo && "cursor-pointer hover:underline")}
      title={`Visto por: ${m.vistos.join(", ") || "nadie todavía"}${m.sinVer.length ? `\nSin ver: ${m.sinVer.join(", ")}` : ""}`}
    >
      <CheckCheck className={cn("mt-px size-3 shrink-0", n ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground")} />
      <span>
        {n === 0 ? <span className="text-muted-foreground">Enviado</span> : <span className="text-sky-700 dark:text-sky-300">Visto por {vistos}</span>}
        {m.sinVer.length > 0 && (!largo || abierto) && <span className="text-muted-foreground"> · Sin ver: {m.sinVer.join(", ")}</span>}
        {m.sinVer.length > 0 && largo && !abierto && <span className="text-muted-foreground"> · {m.sinVer.length} sin ver</span>}
      </span>
    </button>
  );
}

/** «Agregar a…»: buscar a alguien del CRM y sumarlo al canal para destrabar. */
function AgregarPersona({
  tipo,
  id,
  yaEstan,
  alAgregar,
  alCerrar,
}: {
  tipo: TipoChat;
  id: string;
  yaEstan: Set<string>;
  alAgregar: () => Promise<void>;
  alCerrar: () => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<{ id: string; nombre: string; area: string }[] | null>(null);
  const [agregando, setAgregando] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const t = window.setTimeout(async () => {
      const r = await buscarPersonasChat(q).catch(() => []);
      if (vigente) setResultados(r);
    }, 250);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [q]);

  async function agregar(p: { id: string; nombre: string }) {
    setAgregando(p.id);
    const r = await agregarAlChat(tipo, id, p.id);
    setAgregando(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success(r.nuevo ? `${r.nombre} ya está en el canal y le llegó el aviso.` : `${r.nombre} ya estaba en el canal.`);
    await alAgregar();
  }

  return (
    <div className="border-b border-border bg-card px-3 py-2 text-xs">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="font-semibold text-foreground">Agregar a alguien que no está</p>
        <button type="button" onClick={alCerrar} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
          <X className="size-3.5" />
        </button>
      </div>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre o código (gerencia, Central, administración…)"
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
      />
      <ul className="mt-1.5 max-h-44 space-y-0.5 overflow-y-auto">
        {resultados === null ? (
          <li className="py-2 text-center text-muted-foreground">Buscando…</li>
        ) : resultados.length === 0 ? (
          <li className="py-2 text-center text-muted-foreground">Nadie con ese nombre.</li>
        ) : (
          resultados.map((p) => {
            const esta = yaEstan.has(p.id);
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 hover:bg-secondary">
                <span className="min-w-0 truncate">
                  {p.nombre}
                  {p.area ? <span className="text-muted-foreground"> · {p.area}</span> : null}
                </span>
                {esta ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">Ya está</span>
                ) : (
                  <button
                    type="button"
                    disabled={agregando !== null}
                    onClick={() => void agregar(p)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {agregando === p.id ? <Loader2 className="size-3 animate-spin" /> : <UserPlus className="size-3" />} Agregar
                  </button>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
