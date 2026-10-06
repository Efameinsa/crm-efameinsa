"use client";

// Lista de conversaciones de la bandeja de WhatsApp (fase 2, 15-09-2026).
// Pestañas: No leídos (lo que me escribieron y no abrí, 0374), Sin atender
// (lo que nadie tomó), Mías (lo que tengo asignado), Todas (Central y
// gerencia) y Cerradas — mismo criterio de filtros que otras bandejas del CRM.
//
// LA LISTA NO SE CORRE (23-09, comercial: «le hago clic a un cliente del
// chat y como que se corre»). Cada chat es otra página, así que al abrirlo la
// lista se volvía a armar desde arriba y el cliente tocado desaparecía de la
// vista; además Next llevaba la ventana al comienzo del chat. Ahora la
// posición de la lista se guarda por pestaña y se repone al abrir, los
// enlaces no desplazan la página, y el buscador conserva lo escrito.

import Link from "@/components/enlace";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCheck, MessageCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { coincideBusquedaWa, etiquetaDeContactoWa } from "@/lib/contacto-whatsapp";
import { cn } from "@/lib/utils";
import { fechaHoraLima } from "@/lib/fechas";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buscarConversacionesWa, marcarChatsLeidos, type ConversacionWhatsapp, type FiltroConversaciones } from "@/lib/acciones/whatsapp-chat";
import { ventanaDe } from "@/lib/whatsapp";

const TODOS_LOS_COMERCIALES = "__todos";
const CLAVE_BUSQUEDA = "wa-busqueda";

const ESTADO_LEGIBLE: Record<ConversacionWhatsapp["estado"], string> = {
  sin_atender: "sin atender",
  en_gestion: "en gestión",
  cerrada: "cerrada",
};

const PESTANAS: { valor: FiltroConversaciones; etiqueta: string }[] = [
  // Primera, como el filtro de WhatsApp (comercial, 02-10: «tengo que estar
  // buscando en cada chat»).
  { valor: "no_leidos", etiqueta: "No leídos" },
  { valor: "sin_atender", etiqueta: "Sin atender" },
  { valor: "mias", etiqueta: "Mías" },
  { valor: "todas", etiqueta: "Todas" },
  { valor: "cerradas", etiqueta: "Cerradas" },
];

// sessionStorage puede no estar (ventana privada, sitio bloqueado): la lista
// funciona igual, solo que sin recordar.
function leerSesion(clave: string): string | null {
  try {
    return sessionStorage.getItem(clave);
  } catch {
    return null;
  }
}
function guardarSesion(clave: string, valor: string) {
  try {
    if (valor) sessionStorage.setItem(clave, valor);
    else sessionStorage.removeItem(clave);
  } catch {}
}

// La ventana es de 72 h cuando el cliente vino de un anuncio y de 24 en el
// resto (22-09): el semáforo tiene que contar sobre la que de verdad corre.
function ventanaSemaforo(ultimoMensajeClienteAt: string | null, anuncioAt: string | null): { color: string; titulo: string } {
  if (!ultimoMensajeClienteAt) return { color: "bg-muted-foreground/30", titulo: "Sin mensajes del cliente todavía" };
  const { abierta, horas, restanHoras } = ventanaDe(ultimoMensajeClienteAt, anuncioAt);
  if (!abierta) return { color: "bg-red-500", titulo: `Ventana de ${horas} h cerrada: llame al cliente o escríbale desde su WhatsApp` };
  if (restanHoras > 4) return { color: "bg-[#1E7F4F]", titulo: `Ventana de ${horas} h abierta` };
  return { color: "bg-amber-500", titulo: `La ventana de ${horas} h está por cerrarse` };
}

export function WhatsappListaConversaciones({
  conversaciones,
  filtroActivo,
  idActivo,
  comerciales,
  comercialActivo,
  leadsTipificados = [],
  chatsNoLeidos = 0,
}: {
  conversaciones: ConversacionWhatsapp[];
  filtroActivo: FiltroConversaciones;
  idActivo?: string;
  /** Solo Central/gerencia/admin la reciben — un comercial normal no necesita elegir entre comerciales. */
  comerciales?: { id: string; nombre: string }[];
  comercialActivo?: string;
  /** Los leads que YA tienen resultado marcado (22-09): el resto se ve «sin marcar». */
  leadsTipificados?: string[];
  /** Chats abiertos que le escribieron y no abrió, para el número de «No leídos» (0374). */
  chatsNoLeidos?: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [marcando, iniciarMarcado] = useTransition();
  // El chat abierto ya se está leyendo: el servidor contó antes de que se marcara.
  const sinLeerDe = (c: ConversacionWhatsapp) => (c.id === idActivo ? 0 : c.no_leidos);
  const noLeidosEnPestana = chatsNoLeidos - (conversaciones.some((c) => c.id === idActivo && c.no_leidos > 0) ? 1 : 0);
  // MARCAR ANTES DE QUE TERMINE EL DÍA (Carlos, 22-09): «antes del final del
  // día tiene que haber clasificado, porque si no, al día siguiente ya no
  // tiene sentido; la atención es en el día». Acá se ve cuántas faltan.
  const yaMarcados = new Set(leadsTipificados);
  const sinMarcar = conversaciones.filter((c) => c.lead_id && !yaMarcados.has(c.lead_id)).length;

  const listaRef = useRef<HTMLDivElement>(null);
  const claveScroll = `wa-lista:${filtroActivo}:${comercialActivo ?? ""}`;
  const [busqueda, setBusqueda] = useState("");
  const [deOtrasPestanas, setDeOtrasPestanas] = useState<ConversacionWhatsapp[]>([]);
  const [buscando, setBuscando] = useState(false);

  // Reponer la lista donde estaba y lo que se había escrito en el buscador.
  // Solo se mueve la LISTA (scrollTop), nunca la ventana: scrollIntoView
  // también correría la página entera, que es justo lo que se quiere evitar.
  useLayoutEffect(() => {
    const guardado = leerSesion(CLAVE_BUSQUEDA);
    if (guardado) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage solo existe en el navegador
      setBusqueda(guardado);
      setBuscando(guardado.trim().length >= 2);
    }
    const lista = listaRef.current;
    if (!lista) return;
    lista.scrollTop = Number(leerSesion(claveScroll) ?? 0);
    const activo = idActivo ? lista.querySelector<HTMLElement>(`[data-conversacion="${idActivo}"]`) : null;
    if (activo) {
      const arriba = activo.offsetTop;
      const abajo = arriba + activo.offsetHeight;
      if (arriba < lista.scrollTop) lista.scrollTop = arriba;
      else if (abajo > lista.scrollTop + lista.clientHeight) lista.scrollTop = abajo - lista.clientHeight;
    }
    // Solo al montar: después la posición la lleva quien usa la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibles = conversaciones.filter((c) => coincideBusquedaWa(c, busqueda));

  // Lo que se busca puede estar en otra pestaña o ya cerrado: como WhatsApp
  // Web, se busca en todos los chats que uno puede ver.
  useEffect(() => {
    const texto = busqueda.trim();
    if (texto.length < 2) return;
    let vigente = true;
    const espera = setTimeout(async () => {
      const encontrados = await buscarConversacionesWa(texto).catch(() => [] as ConversacionWhatsapp[]);
      if (!vigente) return;
      const enEstaLista = new Set(conversaciones.map((c) => c.id));
      setDeOtrasPestanas(encontrados.filter((c) => !enEstaLista.has(c.id)));
      setBuscando(false);
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [busqueda, conversaciones]);

  function escribir(valor: string) {
    setBusqueda(valor);
    setBuscando(valor.trim().length >= 2);
    setDeOtrasPestanas([]);
    guardarSesion(CLAVE_BUSQUEDA, valor);
  }

  function cambiarFiltro(valor: FiltroConversaciones) {
    const sp = new URLSearchParams(params.toString());
    sp.set("filtro", valor);
    router.push(`/whatsapp?${sp.toString()}`, { scroll: false });
  }

  function cambiarComercial(valor: string) {
    const sp = new URLSearchParams(params.toString());
    if (valor === TODOS_LOS_COMERCIALES) sp.delete("comercial");
    else sp.set("comercial", valor);
    router.push(`/whatsapp?${sp.toString()}`, { scroll: false });
  }

  function marcarTodosLeidos() {
    const ids = conversaciones.filter((c) => sinLeerDe(c) > 0).map((c) => c.id);
    iniciarMarcado(async () => {
      const r = await marcarChatsLeidos(ids);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  function fila(c: ConversacionWhatsapp, mostrarEstado = false) {
    // Un chat cerrado ya no espera nada: el punto rojo/verde de la ventana se
    // leía como «pendiente» (Moisés, 06-10: «ya están atendidos y no salen»).
    const semaforo =
      c.estado === "cerrada"
        ? { color: "bg-muted-foreground/30", titulo: "Chat cerrado" }
        : ventanaSemaforo(c.ultimo_mensaje_cliente_at, c.anuncio_at);
    // Como WhatsApp: el no leído va en negrita, con la hora en verde y el
    // globito con cuántos mensajes le faltan ver. Se reconoce de un vistazo.
    const sinLeer = sinLeerDe(c);
    return (
      <Link
        key={c.id}
        href={`/whatsapp/${c.id}?filtro=${filtroActivo}${comercialActivo ? `&comercial=${comercialActivo}` : ""}`}
        scroll={false}
        data-conversacion={c.id}
        className={cn(
          "flex items-start gap-2.5 border-b border-border/60 px-3 py-3 transition-colors hover:bg-secondary/50",
          idActivo === c.id && "bg-secondary",
          sinLeer > 0 && idActivo !== c.id && "bg-emerald-50/60 dark:bg-emerald-950/20",
        )}
      >
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", semaforo.color)} title={semaforo.titulo} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className={cn("truncate text-sm text-foreground", sinLeer > 0 ? "font-bold" : "font-semibold")}>
              {c.nombre_wa || etiquetaDeContactoWa(c)}
            </p>
            <span className={cn("shrink-0 text-[10px]", sinLeer > 0 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
              {fechaHoraLima(c.ultimo_mensaje_at)}
            </span>
          </div>
          {c.nombre_wa && <p className="truncate text-[11px] tabular-nums text-muted-foreground">{etiquetaDeContactoWa(c)}</p>}
          {c.codigo_campania_wa && (
            <span className="mb-0.5 inline-block rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-semibold text-primary">
              {c.codigo_campania_wa}
            </span>
          )}
          {mostrarEstado ? (
            <span className="mb-0.5 ml-1 inline-block rounded-full bg-secondary px-1.5 py-0 text-[10px] font-semibold text-muted-foreground">
              {ESTADO_LEGIBLE[c.estado]}
            </span>
          ) : (
            c.lead_id &&
            !yaMarcados.has(c.lead_id) && (
              <span className="mb-0.5 ml-1 inline-block rounded-full bg-amber-500/15 px-1.5 py-0 text-[10px] font-semibold text-amber-800">
                sin marcar
              </span>
            )
          )}
          <div className="flex items-center gap-2">
            <p className={cn("min-w-0 flex-1 truncate text-xs", sinLeer > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
              {c.ultimo_texto ?? "—"}
            </p>
            {sinLeer > 0 && (
              <span
                className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold tabular-nums text-white"
                aria-label={`${sinLeer} sin leer`}
              >
                {sinLeer > 99 ? "99+" : sinLeer}
              </span>
            )}
          </div>
          {c.asignado_a_nombre ? (
            <p className="truncate text-[10px] text-muted-foreground">Lo atiende {c.asignado_a_nombre}</p>
          ) : (
            c.sin_comercial_motivo && (
              <p className="truncate text-[10px] font-medium text-amber-700" title={`Ningún comercial lo atiende: ${c.sin_comercial_motivo}. Derívelo.`}>
                Sin comercial · {c.sin_comercial_motivo}
              </p>
            )
          )}
        </div>
      </Link>
    );
  }

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="flex gap-1 border-b border-border p-2">
        {PESTANAS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => cambiarFiltro(p.valor)}
            className={cn(
              "flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              filtroActivo === p.valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
            )}
          >
            {p.etiqueta}
            {p.valor === "no_leidos" && noLeidosEnPestana > 0 && (
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                  filtroActivo === p.valor ? "bg-white/25 text-white" : "bg-emerald-600 text-white",
                )}
              >
                {noLeidosEnPestana > 99 ? "99+" : noLeidosEnPestana}
              </span>
            )}
          </button>
        ))}
      </div>

      {comerciales && comerciales.length > 0 && (
        <div className="border-b border-border p-2">
          <Select<string> value={comercialActivo ?? TODOS_LOS_COMERCIALES} onValueChange={(v) => v && cambiarComercial(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Ver los chats de…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_LOS_COMERCIALES}>Todos los comerciales</SelectItem>
              {comerciales.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="border-b border-border p-2">
        <div className="flex items-center gap-2 rounded-lg bg-secondary/60 px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => escribir(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && escribir("")}
            placeholder="Buscar por número o nombre"
            aria-label="Buscar un chat por número o nombre"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => escribir("")}
              aria-label="Borrar la búsqueda"
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* La búsqueda se recuerda al volver (23-09), así que tiene que verse:
          Moisés, 06-10, dejó «Edy» escrito y creyó que esos chats cerrados
          seguían en su bandeja. */}
      {busqueda.trim() && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="min-w-0 truncate text-[11px] font-medium text-amber-900 dark:text-amber-200">
            Solo se ven los chats con «{busqueda.trim()}»
          </p>
          <button
            type="button"
            onClick={() => escribir("")}
            className="shrink-0 cursor-pointer text-[11px] font-semibold text-primary hover:underline"
          >
            Ver toda la bandeja
          </button>
        </div>
      )}

      {filtroActivo === "no_leidos" && !busqueda && conversaciones.some((c) => sinLeerDe(c) > 0) && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/30 px-3 py-1.5">
          <p className="text-[11px] text-muted-foreground">Le escribieron, no los abrió y aún puede responderles desde acá.</p>
          <button
            type="button"
            onClick={marcarTodosLeidos}
            disabled={marcando}
            className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
          >
            <CheckCheck className="size-3.5" />
            {marcando ? "Marcando…" : "Marcar todos como leídos"}
          </button>
        </div>
      )}

      {sinMarcar > 0 && !busqueda && (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-900">
          {sinMarcar} sin marcar. El resultado se marca el mismo día: después ya no mide nada.
        </p>
      )}

      <div
        ref={listaRef}
        onScroll={(e) => guardarSesion(claveScroll, String(Math.round(e.currentTarget.scrollTop)))}
        className="relative flex-1 overflow-y-auto"
      >
        {visibles.map((c) => fila(c))}

        {busqueda.trim() && deOtrasPestanas.length > 0 && (
          <>
            <p className="border-b border-border bg-secondary/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              En otras pestañas · no están en «{PESTANAS.find((p) => p.valor === filtroActivo)?.etiqueta}»
            </p>
            {deOtrasPestanas.map((c) => fila(c, true))}
          </>
        )}

        {visibles.length === 0 && deOtrasPestanas.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <MessageCircle className="size-8 opacity-30" />
            {busqueda.trim() ? (
              <p>{buscando ? "Buscando…" : `Ningún chat con «${busqueda.trim()}».`}</p>
            ) : filtroActivo === "no_leidos" ? (
              <p>Está al día: no hay chats sin leer.</p>
            ) : (
              <p>Nada por acá todavía.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
