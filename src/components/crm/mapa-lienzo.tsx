"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/enlace";
import { toast } from "sonner";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { BellRing, Check, Loader2, Maximize2, MessageCircle, Minus, Plus, X } from "lucide-react";
import { abrirChat } from "@/components/crm/chat-flotante";
import type { AreaChat } from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { apurarDesdeElMapa } from "@/lib/acciones/mapa";
import { ETIQUETA_AREA, areaQueSeApura, haceCuanto, resumenDeRuta, type AreaMapa, type RutaMapa } from "@/lib/mapa-recorrido";
import type { ApurosMapa } from "@/lib/mapa-recorrido-datos";
import { fechaHoraLima, fechaLimaCorta } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * EL MAPA EN PANTALLA COMPLETA, COMO mapa.efameinsa.com (Santos, 23-10: «no se
 * ve como mapa.efameinsa.com donde hay estadios o secciones de cada área… una
 * pantalla completa o una ventana modal grande para poder ubicarse donde
 * indiquen los pasos y cómo se relacionan con otras áreas»).
 *
 * Un carril por área con los colores de los diagramas BPMN del mapa
 * (procesos-def.mjs), cada paso en el carril de quien lo hace y la flecha que
 * baja o sube de carril cuando el trabajo pasa a otra área. El tramo recorrido
 * va en verde con el trazo animado del mapa; lo que falta, en rojo punteado; la
 * etapa atascada palpita. Se navega como el lienzo del mapa: rueda = acercar al
 * cursor, arrastrar el fondo = mover, doble clic en el fondo = ver todo.
 */

// Orden de arriba abajo y colores: los mismos carriles de mapa.efameinsa.com (Cliente arriba).
const CARRILES: { area: AreaMapa; fondo: string; borde: string; texto: string }[] = [
  { area: "cliente", fondo: "#EEF1F5", borde: "#A9B4C2", texto: "#475569" },
  { area: "comercial", fondo: "#FCE9DA", borde: "#E0A877", texto: "#9A4A12" },
  { area: "central", fondo: "#ECE6F4", borde: "#B4A3D1", texto: "#5B3F8C" },
  { area: "postventa", fondo: "#E4F1E5", borde: "#93C59A", texto: "#2F6B3A" },
  { area: "tecnico", fondo: "#E2F1F4", borde: "#8CC3CE", texto: "#1F6573" },
  { area: "almacen", fondo: "#EEEAE6", borde: "#B9AEA4", texto: "#5E5248" },
  { area: "finanzas", fondo: "#FBF5DE", borde: "#D9C277", texto: "#7A5E0B" },
  { area: "contabilidad", fondo: "#F3E4EE", borde: "#CFA0BF", texto: "#7D3767" },
];

const COL = 184; // ancho de columna
const NW = 154; // ancho del paso
const NH = 72; // alto del paso
const FILA = 100; // alto del carril
const IZQ = 28; // margen antes del primer paso (los nombres van en su columna fija)
const ARR = 16;

type Estado = "hecho" | "no_aplica" | "actual" | "falta";
const estadoDe = (r: RutaMapa, i: number): Estado => {
  const e = r.etapas[i];
  if (e.hecho) return "hecho";
  if (e.noAplica) return "no_aplica";
  return i === r.actual ? "actual" : "falta";
};

function disponer(r: RutaMapa) {
  const usados = CARRILES.filter((c) => r.etapas.some((e) => e.area === c.area));
  const fila = new Map(usados.map((c, i) => [c.area, i]));
  const nodos = r.etapas.map((e, i) => {
    const f = fila.get(e.area) ?? 0;
    const x = IZQ + i * COL;
    const y = ARR + f * FILA + (FILA - NH) / 2;
    return { i, x, y, cx: x + NW / 2, cy: y + NH / 2 };
  });
  const W = IZQ + r.etapas.length * COL + 40;
  const H = ARR * 2 + usados.length * FILA;
  return { usados, nodos, W, H };
}

export function MapaLienzo({
  rutas,
  apuros,
  ruta,
  abierto,
  alCambiar,
  inicial = 0,
}: {
  rutas: RutaMapa[];
  apuros: ApurosMapa;
  ruta: string;
  abierto: boolean;
  alCambiar: (v: boolean) => void;
  inicial?: number;
}) {
  const [cual, setCual] = useState(inicial);
  const r = rutas[Math.min(cual, rutas.length - 1)];
  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiar}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex flex-col bg-background outline-none sm:inset-3 sm:rounded-xl sm:border sm:border-border sm:shadow-2xl">
          <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
            <DialogPrimitive.Title className="text-sm font-bold uppercase tracking-wide text-foreground">Mapa del recorrido</DialogPrimitive.Title>
            {rutas.length > 1 && (
              <nav className="flex flex-wrap gap-1" aria-label="Recorridos">
                {rutas.map((x, i) => (
                  <button
                    key={`${x.tipo}:${x.id}`}
                    type="button"
                    onClick={() => setCual(i)}
                    className={cn(
                      "inline-flex max-w-[16rem] items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-xs font-medium",
                      i === cual ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-accent",
                    )}
                  >
                    {x.actual >= 0 ? <span className="size-2 shrink-0 rounded-full bg-red-500" /> : <Check className="size-3 shrink-0" />}
                    <span className="truncate">{x.titulo}</span>
                  </button>
                ))}
              </nav>
            )}
            <p className={cn("min-w-0 flex-1 truncate text-xs", r.actual >= 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300")}>
              {rutas.length === 1 ? <span className="font-semibold text-foreground">{r.titulo}: </span> : null}
              {resumenDeRuta(r)}
            </p>
            <DialogPrimitive.Close render={<Button variant="ghost" size="icon-sm" aria-label="Cerrar el mapa" />}>
              <X className="size-4" />
            </DialogPrimitive.Close>
          </header>
          <Lienzo key={`${r.tipo}:${r.id}`} r={r} apuros={apuros} ruta={ruta} alCerrar={() => alCambiar(false)} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Lienzo({ r, apuros, ruta, alCerrar }: { r: RutaMapa; apuros: ApurosMapa; ruta: string; alCerrar: () => void }) {
  const { usados, nodos, W, H } = useMemo(() => disponer(r), [r]);
  const [elegida, setElegida] = useState(r.actual >= 0 ? r.actual : r.etapas.length - 1);
  const caja = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState({ k: 1, x: 0, y: 0 });
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  // Encuadre: entra todo el alto; si no entra a lo ancho, la etapa atascada queda al centro.
  const encuadrar = useCallback(() => {
    const el = caja.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const k = Math.max(0.45, Math.min(1, (h - 40) / H, Math.max((w - 24) / W, 0.85)));
    const foco = r.actual >= 0 ? nodos[r.actual] : nodos[nodos.length - 1];
    // Si entra, centrado; si casi entra, desde el primer paso; si es largo, con la etapa atascada al centro.
    const x = W * k <= w ? (w - W * k) / 2 : W * k <= w * 1.3 ? 12 : Math.min(12, Math.max(w - W * k - 12, w / 2 - foco.cx * k));
    setVista({ k, x, y: Math.max(12, (h - H * k) / 2) });
  }, [H, W, nodos, r.actual]);
  useLayoutEffect(() => {
    encuadrar();
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(() => encuadrar());
    ro.observe(el);
    return () => ro.disconnect();
  }, [encuadrar]);

  // Rueda = acercar al cursor (con listener propio: React no deja cancelar el scroll en onWheel).
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const rueda = (ev: WheelEvent) => {
      ev.preventDefault();
      const b = el.getBoundingClientRect();
      const px = ev.clientX - b.left;
      const py = ev.clientY - b.top;
      setVista((v) => {
        if (ev.shiftKey) return { ...v, x: v.x - ev.deltaY };
        const k = Math.min(2.5, Math.max(0.3, v.k * Math.exp(-ev.deltaY * 0.0015)));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, []);

  const zoom = (f: number) =>
    setVista((v) => {
      const el = caja.current;
      const px = (el?.clientWidth ?? 0) / 2;
      const py = (el?.clientHeight ?? 0) / 2;
      const k = Math.min(2.5, Math.max(0.3, v.k * f));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });

  const tramo = (i: number) => {
    const a = nodos[i];
    const b = nodos[i + 1];
    const x1 = a.x + NW;
    const x2 = b.x - 4;
    if (Math.abs(a.cy - b.cy) < 1) return `M${x1},${a.cy} H${x2}`;
    const xm = x1 + (COL - NW) / 2;
    return `M${x1},${a.cy} H${xm} V${b.cy} H${x2}`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1">
      {/* Los nombres de los carriles, en su columna fija: se sabe de qué área es cada franja aunque el mapa se mueva. */}
      <div className="relative w-24 shrink-0 overflow-hidden border-r border-border bg-card sm:w-32" aria-hidden>
        {usados.map((c, f) => (
          <span
            key={c.area}
            className="absolute inset-x-1 flex items-center rounded-md border px-1.5 font-mono text-[10.5px] leading-tight font-bold sm:px-2 sm:text-[11.5px]"
            style={{ top: vista.y + (ARR + f * FILA + 4) * vista.k, height: (FILA - 8) * vista.k, background: c.fondo, borderColor: c.borde, color: c.texto }}
          >
            {c.area === "contabilidad" ? "Contabilidad / Facturación" : ETIQUETA_AREA[c.area]}
          </span>
        ))}
      </div>
      <div
        ref={caja}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden bg-[radial-gradient(circle,rgb(148_163_184/0.25)_1px,transparent_1px)] bg-[length:22px_22px] active:cursor-grabbing"
        onPointerDown={(e) => {
          if ((e.target as Element).closest("[data-paso]")) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y };
        }}
        onPointerMove={(e) => {
          const a = arrastre.current;
          if (a) setVista((v) => ({ ...v, x: a.vx + e.clientX - a.x, y: a.vy + e.clientY - a.y }));
        }}
        onPointerUp={() => (arrastre.current = null)}
        onPointerCancel={() => (arrastre.current = null)}
        onDoubleClick={(e) => {
          if (!(e.target as Element).closest("[data-paso]")) encuadrar();
        }}
      >
        <svg width="100%" height="100%" className="absolute inset-0 select-none" role="img" aria-label={`Mapa: ${r.titulo}`}>
          <defs>
            <marker id="mapa-flecha-verde" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#2E9D62" />
            </marker>
            <marker id="mapa-flecha-roja" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#E05252" />
            </marker>
          </defs>
          <g transform={`translate(${vista.x},${vista.y}) scale(${vista.k})`}>
            {/* Los carriles: una franja por área, como las regiones del mapa. */}
            {usados.map((c, f) => (
              <g key={c.area}>
                <rect x={0} y={ARR + f * FILA + 4} width={W} height={FILA - 8} rx={10} fill={c.fondo} stroke={c.borde} strokeDasharray="6 5" strokeWidth={1.2} className="dark:opacity-25" />
              </g>
            ))}
            {/* Las flechas: de un paso al siguiente, bajando o subiendo de carril. */}
            {nodos.slice(0, -1).map((_, i) => {
              const ea = estadoDe(r, i);
              const eb = estadoDe(r, i + 1);
              const verde = (ea === "hecho" || ea === "no_aplica") && (eb === "hecho" || eb === "no_aplica" || eb === "actual");
              return (
                <path
                  key={i}
                  d={tramo(i)}
                  fill="none"
                  stroke={verde ? "#2E9D62" : "#E05252"}
                  strokeWidth={verde ? 2.4 : 1.8}
                  strokeDasharray={verde ? "10 6" : "5 5"}
                  markerEnd={`url(#mapa-flecha-${verde ? "verde" : "roja"})`}
                  className={verde ? "mapa-trazo" : undefined}
                  opacity={verde ? 1 : 0.8}
                />
              );
            })}
            {/* Los pasos. */}
            {r.etapas.map((e, i) => {
              const n = nodos[i];
              const est = estadoDe(r, i);
              return (
                <foreignObject key={`${e.clave}-${i}`} x={n.x - 6} y={n.y - 6} width={NW + 12} height={NH + 12}>
                  <button
                    type="button"
                    data-paso
                    onClick={() => setElegida(i)}
                    aria-pressed={elegida === i}
                    className={cn(
                      "m-[6px] flex h-[72px] w-[154px] flex-col gap-0.5 overflow-hidden rounded-lg border-[1.5px] px-2 py-1.5 text-left font-mono text-[10.5px] leading-tight shadow-sm outline-none",
                      est === "hecho" && "border-[#7CC79A] bg-[#E7F6EC] text-[#14532D]",
                      est === "no_aplica" && "border-dashed border-slate-300 bg-slate-50 text-slate-500",
                      est === "falta" && "border-[#E58A8A] bg-white text-[#9B1C1C]",
                      est === "actual" && "mapa-latir border-2 border-[#DC2626] bg-[#FEE2E2] text-[#7F1D1D]",
                      elegida === i && "ring-2 ring-[#1F1A18]/70 ring-offset-1",
                    )}
                  >
                    <span className="flex items-center justify-between gap-1 text-[9px] font-semibold uppercase tracking-wide opacity-80">
                      <span className="truncate">{est === "actual" ? "● Aquí está" : est === "hecho" ? "Hecho" : est === "no_aplica" ? "No corresponde" : "Falta"}</span>
                      {est === "hecho" ? <Check className="size-3 shrink-0" /> : est === "no_aplica" ? <Minus className="size-3 shrink-0" /> : null}
                    </span>
                    <span className="line-clamp-2 font-bold">{e.etiqueta}</span>
                    <span className="mt-auto truncate text-[9.5px] opacity-75">
                      {est === "actual"
                        ? haceCuanto(r.desde) ?? ""
                        : est === "hecho"
                          ? [e.cuando ? fechaLimaCorta(e.cuando) : null, e.quien].filter(Boolean).join(" · ")
                          : ""}
                    </span>
                  </button>
                </foreignObject>
              );
            })}
          </g>
        </svg>
        {/* Controles y leyenda, como en el mapa. */}
        <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-sm">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => zoom(1 / 1.2)} aria-label="Alejar">
            <Minus className="size-4" />
          </Button>
          <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">{Math.round(vista.k * 100)}%</span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => zoom(1.2)} aria-label="Acercar">
            <Plus className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={encuadrar} aria-label="Ver todo">
            <Maximize2 className="size-4" />
          </Button>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 hidden flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card/95 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm sm:flex">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded border border-[#7CC79A] bg-[#E7F6EC]" /> Hecho</span>
          <span className="inline-flex items-center gap-1.5"><span className="mapa-latir inline-block size-3 rounded border-2 border-[#DC2626] bg-[#FEE2E2]" /> Aquí está atascado</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded border border-[#E58A8A] bg-white" /> Falta</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded border border-dashed border-slate-300 bg-slate-50" /> No corresponde</span>
          <span>· rueda = acercar · arrastrar = mover · doble clic = ver todo</span>
        </div>
      </div>
      </div>
      <PanelDelPaso r={r} i={elegida} apuros={apuros} ruta={ruta} alCerrar={alCerrar} />
    </div>
  );
}

/** El área del chat que corresponde a la etapa (el técnico lo programa postventa; al cliente no se le escribe aquí). */
const AREA_CHAT_DE: Partial<Record<AreaMapa, AreaChat>> = {
  central: "central",
  almacen: "almacen",
  finanzas: "finanzas",
  contabilidad: "contabilidad",
  postventa: "postventa",
  tecnico: "postventa",
  comercial: "comercial",
};

function PanelDelPaso({ r, i, apuros, ruta, alCerrar }: { r: RutaMapa; i: number; apuros: ApurosMapa; ruta: string; alCerrar: () => void }) {
  const e = r.etapas[i];
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [nota, setNota] = useState("");
  if (!e) return null;
  const conChat = r.tipo !== "recepcion";
  const areaChat = AREA_CHAT_DE[e.area] ?? null;
  const est = estadoDe(r, i);
  const area = areaQueSeApura(e.area);
  const apuro = area ? apuros[`${r.tipo}:${r.id}:${area}`] : undefined;
  const nombreApurado = ETIQUETA_AREA[e.area === "tecnico" ? "postventa" : e.area];

  function apurar() {
    if (!area || !e) return;
    empezar(async () => {
      const res = await apurarDesdeElMapa({ tipo: r.tipo, id: r.id, area, paso: e.clave, etiqueta: e.etiqueta, ruta, desde: r.desde, nota });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Listo: ${nombreApurado} recibió el aviso${(res.avisoNumero ?? 1) <= 2 ? " con zumbido" : " con sirena"}, sin que se le cierre lo que estaba haciendo${(res.avisoNumero ?? 1) > 1 ? ` (aviso n.º ${res.avisoNumero}; gerencia también se entera)` : ""}.`);
      setNota("");
      router.refresh();
    });
  }

  return (
    <aside
      className={cn(
        "max-h-[42dvh] shrink-0 overflow-y-auto border-t border-border p-4 text-sm lg:max-h-none lg:w-[22rem] lg:border-t-0 lg:border-l",
        est === "actual" ? "bg-red-50/70 dark:bg-red-950/30" : "bg-card",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Paso {i + 1} de {r.etapas.length} · {ETIQUETA_AREA[e.area]}
      </p>
      <h3 className="mt-1 text-base font-bold leading-snug text-foreground">{e.etiqueta}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {est === "hecho"
          ? `Hecho${e.cuando ? ` el ${fechaHoraLima(e.cuando)}` : ""}${e.quien ? ` por ${e.quien}` : ""}.`
          : est === "no_aplica"
            ? e.noAplica
            : est === "actual"
              ? `Aquí está atascado${r.desde ? ` desde el ${fechaHoraLima(r.desde)} (${haceCuanto(r.desde)})` : ""}. Le toca a ${ETIQUETA_AREA[e.area]}.`
              : "Todavía no llega aquí."}
      </p>
      {e.trabado && <p className="mt-2 text-xs font-medium text-red-800 dark:text-red-300">Qué lo traba: {e.trabado}</p>}
      {e.alerta && <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-300">{e.alerta}</p>}
      {e.detalle && <p className="mt-2 text-xs text-muted-foreground">{e.detalle}</p>}
      {est === "actual" && e.area === "cliente" && <p className="mt-2 text-xs text-muted-foreground">Le toca al cliente: llámelo o escríbale desde la ficha.</p>}
      {est === "actual" && area && (
        <div className="mt-4 space-y-1.5">
          {conChat && (
            <textarea
              value={nota}
              onChange={(ev) => setNota(ev.target.value)}
              maxLength={500}
              rows={2}
              placeholder="¿Qué necesita? (opcional: va en el aviso y queda en el chat del caso)"
              className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
            />
          )}
          <Button type="button" variant="destructive" onClick={apurar} disabled={pendiente} className="w-full">
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
            Apurar a {nombreApurado}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {apuro
              ? `Último apuro: ${fechaHoraLima(apuro.at)}${apuro.quien ? ` por ${apuro.quien}` : ""} · ${apuro.n} ${apuro.n === 1 ? "vez" : "veces"}.`
              : "Le llega un aviso con sirena. Una vez cada 15 minutos; desde el segundo, también a gerencia."}
          </p>
        </div>
      )}
      {conChat && (
        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full"
          onClick={() => {
            // El mapa se cierra para que el chat (que flota abajo a la derecha) quede libre para escribir.
            alCerrar();
            abrirChat(r.tipo as "caso" | "pedido", r.id, est === "actual" ? areaChat : null);
          }}
        >
          <MessageCircle className="size-4" />
          {est === "actual" && areaChat ? `Escribir a ${nombreApurado} en el chat` : "Abrir el chat de este recorrido"}
        </Button>
      )}
      {r.enlace && !ruta.startsWith(r.enlace) && (
        <Link href={r.enlace} className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
          Ir a la ficha de este recorrido →
        </Link>
      )}
    </aside>
  );
}
