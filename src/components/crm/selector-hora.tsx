"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Selector de hora moderno (ejemplo-hora.png de Darwin, 19-08): chip con el
// mismo lenguaje visual que SelectorFecha que abre un popover con campo para
// tipear y lista de medias horas — reemplaza al <input type="time"> nativo.
// Tipear filtra la lista ("14" → 14:00/14:30) y Enter acepta también horas
// sueltas ("14:45"). Igual que SelectorFecha, el popover va por PORTAL con
// position fixed: el panel lateral de la agenda se anima con translate-x
// (un transform), y un fixed sin portal se ancla al panel, no al viewport.

const ALTO_POPOVER = 252;
const ANCHO_POPOVER = 168;
const ALTO_FILA = 32;

const OPCIONES: string[] = [];
for (let h = 0; h < 24; h++) for (const m of ["00", "30"]) OPCIONES.push(`${String(h).padStart(2, "0")}:${m}`);

/** "9" → "09:00", "14:45" → "14:45", "935" → "09:35"; inválido → null. */
export function normalizar(texto: string): string | null {
  const limpio = texto.trim();
  let m = limpio.match(/^(\d{1,2}):([0-5]\d)$/) ?? limpio.match(/^(\d{1,2})$/);
  if (!m && /^\d{3,4}$/.test(limpio)) m = [limpio, limpio.slice(0, -2), limpio.slice(-2)] as RegExpMatchArray;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function coincide(opcion: string, q: string): boolean {
  const b = q.replace(/[^\d]/g, "");
  if (!b) return true;
  const a = opcion.replace(":", "");
  return a.startsWith(b) || a.replace(/^0/, "").startsWith(b);
}

export function SelectorHora({
  valor,
  onCambiar,
  deshabilitado = false,
  etiquetaVacia = "Hora",
}: {
  valor: string | null; // "HH:MM" o null = todo el día
  onCambiar: (hora: string | null) => void;
  deshabilitado?: boolean;
  etiquetaVacia?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  const reposicionar = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - ANCHO_POPOVER - 8));
    const abajo = r.bottom + 6 + ALTO_POPOVER <= window.innerHeight;
    setPos({ top: abajo ? r.bottom + 6 : Math.max(8, r.top - 6 - ALTO_POPOVER), left });
  };
  useLayoutEffect(() => {
    if (!abierto) return;
    reposicionar();
    // Arranca viendo la hora elegida (o media mañana, horario laboral).
    const idx = OPCIONES.findIndex((o) => o >= (valor ?? "08:00"));
    if (lista.current) lista.current.scrollTop = Math.max(0, idx * ALTO_FILA - ALTO_FILA);
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps
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

  function elegir(hora: string | null) {
    onCambiar(hora);
    setAbierto(false);
  }

  const filtradas = OPCIONES.filter((o) => coincide(o, texto));

  return (
    <div ref={raiz} className="relative inline-block">
      <button
        ref={boton}
        type="button"
        disabled={deshabilitado}
        onClick={() => { setTexto(""); setAbierto((v) => !v); }}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors",
          deshabilitado && "cursor-not-allowed opacity-50",
          valor
            ? "border-primary/40 bg-primary/5 font-semibold text-primary hover:bg-primary/10"
            : "border-dashed border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        aria-haspopup="listbox"
        aria-expanded={abierto}
      >
        <Clock className="size-3.5" />
        {valor ?? etiquetaVacia}
        {valor && !deshabilitado && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Quitar hora"
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
          aria-label="Elegir hora"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: ANCHO_POPOVER, height: ALTO_POPOVER }}
          className="z-[70] flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          <div className="border-b border-border p-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const exacta = normalizar(texto);
                if (exacta) elegir(exacta);
                else if (filtradas.length === 1) elegir(filtradas[0]);
              }}
              placeholder="ej. 14:30"
              autoFocus
              inputMode="numeric"
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums text-foreground"
              aria-label="Tipear hora"
            />
          </div>
          <ul ref={lista} role="listbox" aria-label="Horas" className="flex-1 overflow-y-auto py-1">
            {filtradas.map((o) => {
              const elegida = o === valor;
              return (
                <li key={o}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={elegida}
                    onClick={() => elegir(o)}
                    style={{ height: ALTO_FILA }}
                    className={cn(
                      "flex w-full cursor-pointer items-center px-3 text-sm tabular-nums transition-colors",
                      elegida ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-accent",
                    )}
                  >
                    {o}
                  </button>
                </li>
              );
            })}
            {filtradas.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">Ninguna hora coincide</li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => elegir(null)}
            className="cursor-pointer border-t border-border px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Sin hora (todo el día)
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
