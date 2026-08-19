"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Selector de fecha estilo Asana (ejemplo_calendario.png aprobado por Darwin
// 19-08): mini-calendario en popover con hoy encerrado en un círculo, día
// elegido en granate y atajos Hoy / Mañana / Próx. semana DENTRO del
// calendario. Es EL selector de fecha del CRM: registro de gestión, filtros
// de período, reprogramar y tareas — no volver al <input type="date"> nativo.
//
// El popover se posiciona con `position: fixed` calculado desde el botón y
// se renderiza por PORTAL en el body: dentro de contenedores con overflow
// (la animación del RegistroRapido, el panel lateral con scroll) un popover
// absolute quedaba RECORTADO, y un fixed SIN portal dentro del panel lateral
// (que se anima con translate-x, un transform) se anclaba al panel en vez
// del viewport y caía fuera de pantalla — invisible (bug reportado por
// Darwin dos veces). Si no hay sitio abajo, se abre hacia arriba.

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_CORTOS = ["L", "M", "M", "J", "V", "S", "D"];
const ALTO_POPOVER = 352;
const ANCHO_POPOVER = 264;

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function grilla(mes: string): { iso: string; dia: number; otroMes: boolean }[] {
  const [y, m] = mes.split("-").map(Number);
  const primero = new Date(Date.UTC(y, m - 1, 1));
  const offset = (primero.getUTCDay() + 6) % 7;
  const inicio = new Date(primero);
  inicio.setUTCDate(1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio);
    d.setUTCDate(inicio.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return { iso, dia: d.getUTCDate(), otroMes: !iso.startsWith(mes) };
  });
}

export function etiquetaFechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const dia = d.toLocaleDateString("es-PE", { weekday: "short" });
  return `${dia} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

export function SelectorFecha({
  valor,
  onCambiar,
  permitirQuitar = true,
  etiquetaVacia = "Elegir fecha",
  min,
  max,
  compacto = false,
}: {
  valor: string | null;
  onCambiar: (fecha: string | null) => void;
  permitirQuitar?: boolean;
  etiquetaVacia?: string;
  min?: string; // YYYY-MM-DD — días anteriores deshabilitados
  max?: string; // YYYY-MM-DD — días posteriores deshabilitados
  compacto?: boolean; // trigger más chico (filtros)
}) {
  const [abierto, setAbierto] = useState(false);
  const [mesVista, setMesVista] = useState((valor ?? hoyISO()).slice(0, 7));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const hoy = hoyISO();

  // Posición fija anclada al botón, con volteo hacia arriba si no hay sitio.
  const reposicionar = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - ANCHO_POPOVER - 8));
    const abajo = r.bottom + 6 + ALTO_POPOVER <= window.innerHeight;
    setPos({ top: abajo ? r.bottom + 6 : Math.max(8, r.top - 6 - ALTO_POPOVER), left });
  };
  useLayoutEffect(() => {
    if (abierto) reposicionar();
  }, [abierto]);
  useEffect(() => {
    if (!abierto) return;
    const clic = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!raiz.current?.contains(t) && !panel.current?.contains(t)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setAbierto(false); }
    };
    const mover = () => reposicionar();
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("resize", mover);
    document.addEventListener("scroll", mover, true);
    return () => {
      document.removeEventListener("mousedown", clic);
      document.removeEventListener("keydown", tecla, true);
      window.removeEventListener("resize", mover);
      document.removeEventListener("scroll", mover, true);
    };
  }, [abierto]);

  function fueraDeRango(iso: string): boolean {
    return (min !== undefined && iso < min) || (max !== undefined && iso > max);
  }
  function elegir(iso: string | null) {
    if (iso && fueraDeRango(iso)) return;
    onCambiar(iso);
    setAbierto(false);
    if (iso) setMesVista(iso.slice(0, 7));
  }
  function moverMes(delta: number) {
    const [y, m] = mesVista.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMesVista(d.toISOString().slice(0, 7));
  }

  const [anio, mesN] = mesVista.split("-").map(Number);

  return (
    <div ref={raiz} className="relative inline-block">
      <button
        ref={boton}
        type="button"
        onClick={() => { setMesVista((valor ?? hoyISO()).slice(0, 7)); setAbierto((v) => !v); }}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border transition-colors",
          compacto ? "px-2 py-1 text-[11.5px]" : "px-3 py-1.5 text-xs",
          valor
            ? "border-primary/40 bg-primary/5 font-semibold text-primary hover:bg-primary/10"
            : "border-dashed border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        aria-haspopup="dialog"
        aria-expanded={abierto}
      >
        <CalendarDays className={compacto ? "size-3" : "size-3.5"} />
        {valor ? etiquetaFechaCorta(valor) : etiquetaVacia}
        {valor && permitirQuitar && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Quitar fecha"
            onClick={(e) => { e.stopPropagation(); elegir(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); elegir(null); } }}
            className="ml-0.5 rounded-full p-0.5 hover:bg-primary/15"
          >
            <X className="size-3" />
          </span>
        )}
      </button>

      {abierto && pos && createPortal(
        <div
          ref={panel}
          role="dialog"
          aria-label="Elegir fecha"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: ANCHO_POPOVER }}
          className="z-[70] rounded-xl border border-border bg-card p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => moverMes(-1)} className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Mes anterior">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-bold capitalize text-foreground">
              {MESES[mesN - 1]} {anio}
            </span>
            <button type="button" onClick={() => moverMes(1)} className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Mes siguiente">
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center">
            {DIAS_CORTOS.map((d, i) => (
              <span key={i} className="pb-1 text-[10px] font-bold uppercase text-muted-foreground">{d}</span>
            ))}
            {grilla(mesVista).map((d) => {
              const esHoy = d.iso === hoy;
              const elegido = d.iso === valor;
              const bloqueado = fueraDeRango(d.iso);
              return (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => elegir(d.iso)}
                  disabled={bloqueado}
                  className={cn(
                    "mx-auto my-0.5 flex size-8 items-center justify-center rounded-full text-xs tabular-nums transition-colors",
                    bloqueado
                      ? "cursor-not-allowed text-muted-foreground/25"
                      : d.otroMes
                        ? "cursor-pointer text-muted-foreground/40 hover:bg-accent"
                        : "cursor-pointer text-foreground hover:bg-accent",
                    !bloqueado && d.iso < hoy && !d.otroMes && "text-muted-foreground/60",
                    esHoy && !elegido && "font-bold text-primary ring-1 ring-inset ring-primary",
                    elegido && "bg-primary font-bold text-primary-foreground hover:bg-primary",
                  )}
                >
                  {d.dia}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
            {([["Hoy", 0], ["Mañana", 1], ["Próx. semana", 7]] as const).map(([et, n]) => {
              const iso = sumarDias(hoy, n);
              if (fueraDeRango(iso)) return null;
              return (
                <button
                  key={et}
                  type="button"
                  onClick={() => elegir(iso)}
                  className={cn(
                    "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    valor === iso ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {et}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
