"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EL SELECTOR DE FECHA Y HORA DE LA PROPUESTA (24-09).
 *
 * Santos: «veo que aún usan ese estilo para los calendarios, no se parece al
 * estilo de la nueva UI… debería ser más ovalado… corregir también el de
 * poner hora». Los campos de fecha y hora del CRM son los nativos del
 * navegador (29 en 17 pantallas), y su ventanita no se puede pintar con CSS.
 *
 * En vez de tocar cada formulario, dentro de la propuesta este componente
 * atiende el clic en cualquier `input[type=date|time]`, no deja abrir la
 * ventanita nativa y muestra la suya: redonda, con la paleta nueva. Al
 * elegir, escribe el valor en el mismo campo y avisa con los eventos de
 * siempre (input y change), así cada formulario lo recibe como si se hubiera
 * tecleado. Se puede seguir escribiendo a mano en el campo.
 */

type Abierto = { input: HTMLInputElement; tipo: "date" | "time"; x: number; y: number; arriba: boolean; destino: HTMLElement };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const ANCHO = { date: 288, time: 276 };
const ALTO = { date: 340, time: 300 };

const dosDigitos = (n: number) => String(n).padStart(2, "0");
const isoDe = (a: number, m: number, d: number) => `${a}-${dosDigitos(m + 1)}-${dosDigitos(d)}`;
const hoyIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

/** Escribe el valor como si se hubiera tecleado: React y los formularios lo ven. */
function escribir(input: HTMLInputElement, valor: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  set?.call(input, valor);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function SelectorFechaHora() {
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const cerrar = useCallback(() => setAbierto(null), []);

  useEffect(() => {
    const alTocar = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (caja.current?.contains(el)) return;
      const input = el?.closest?.("input") as HTMLInputElement | null;
      if (input && (input.type === "date" || input.type === "time") && input.closest(".propuesta") && !input.disabled && !input.readOnly) {
        // Sin la ventanita nativa: esta la reemplaza.
        e.preventDefault();
        const r = input.getBoundingClientRect();
        const tipo = input.type as "date" | "time";
        const arriba = r.bottom + ALTO[tipo] + 8 > window.innerHeight && r.top > ALTO[tipo] + 8;
        const x = Math.min(Math.max(8, r.left), window.innerWidth - ANCHO[tipo] - 8);
        // Dentro de una ventana (diálogo) se dibuja DENTRO de ella: si no, el
        // clic en el selector cuenta como «afuera» y la ventana se cierra. La
        // ventana está centrada con `translate`, que vuelve relativo a ella
        // todo lo `fixed`: se descuenta su esquina.
        const ventana = input.closest<HTMLElement>('[data-slot="dialog-content"], [role="dialog"]');
        const destino = ventana ?? document.body;
        const esquina = ventana ? ventana.getBoundingClientRect() : { left: 0, top: 0 };
        setAbierto({ input, tipo, x: x - esquina.left, y: (arriba ? r.top - 6 : r.bottom + 6) - esquina.top, arriba, destino });
        return;
      }
      setAbierto(null);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(null);
    };
    const alMover = (e: Event) => {
      if (caja.current && e.target instanceof Node && caja.current.contains(e.target)) return;
      setAbierto(null);
    };
    document.addEventListener("click", alTocar, true);
    document.addEventListener("keydown", alTeclear);
    window.addEventListener("resize", alMover);
    window.addEventListener("scroll", alMover, true);
    return () => {
      document.removeEventListener("click", alTocar, true);
      document.removeEventListener("keydown", alTeclear);
      window.removeEventListener("resize", alMover);
      window.removeEventListener("scroll", alMover, true);
    };
  }, []);

  if (!abierto) return null;
  return createPortal(
    <div
      ref={caja}
      role="dialog"
      aria-label={abierto.tipo === "date" ? "Elegir fecha" : "Elegir hora"}
      className={cn("selector-emergente fixed z-[70] rounded-2xl border border-border bg-popover p-3 text-popover-foreground", abierto.arriba && "-translate-y-full")}
      style={{ left: abierto.x, top: abierto.y, width: ANCHO[abierto.tipo] }}
    >
      {abierto.tipo === "date" ? (
        <Calendario
          input={abierto.input}
          onElegir={(v) => {
            escribir(abierto.input, v);
            cerrar();
          }}
        />
      ) : (
        <Reloj
          input={abierto.input}
          onElegir={(v, listo) => {
            escribir(abierto.input, v);
            if (listo) cerrar();
          }}
        />
      )}
    </div>,
    // Fuera de una ventana, al <body>, que también lleva el tema (ver tema-en-el-cuerpo).
    abierto.destino,
  );
}

function Calendario({ input, onElegir }: { input: HTMLInputElement; onElegir: (v: string) => void }) {
  const hoy = hoyIso();
  const valor = input.value || "";
  const base = valor || hoy;
  const [vista, setVista] = useState(() => ({ a: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 }));
  const min = input.min || null;
  const max = input.max || null;

  // Lunes primero (como el resto del CRM).
  const primero = new Date(Date.UTC(vista.a, vista.m, 1));
  const desplazamiento = (primero.getUTCDay() + 6) % 7;
  const diasMes = new Date(Date.UTC(vista.a, vista.m + 1, 0)).getUTCDate();
  const celdas: ({ d: number; iso: string } | null)[] = [
    ...Array.from({ length: desplazamiento }, () => null),
    ...Array.from({ length: diasMes }, (_, i) => ({ d: i + 1, iso: isoDe(vista.a, vista.m, i + 1) })),
  ];
  const mover = (n: number) => setVista((v) => {
    const t = v.m + n;
    return { a: v.a + Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
  });
  const fuera = (iso: string) => (min !== null && iso < min) || (max !== null && iso > max);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => mover(-1)} className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Mes anterior">
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-sm font-bold capitalize">
          {MESES[vista.m]} <span className="font-medium text-muted-foreground">{vista.a}</span>
        </p>
        <button type="button" onClick={() => mover(1)} className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Mes siguiente">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DIAS.map((d) => (
          <span key={d} className="pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            {d}
          </span>
        ))}
        {celdas.map((c, i) =>
          c ? (
            <button
              key={c.iso}
              type="button"
              disabled={fuera(c.iso)}
              onClick={() => onElegir(c.iso)}
              className={cn(
                "mx-auto flex size-9 items-center justify-center rounded-full text-[13px] tabular-nums transition-all duration-150",
                c.iso === valor
                  ? "bg-primary font-bold text-primary-foreground shadow-md"
                  : c.iso === hoy
                    ? "font-bold text-primary ring-1 ring-inset ring-primary/40 hover:bg-primary/10"
                    : "text-foreground hover:scale-110 hover:bg-accent",
                fuera(c.iso) && "cursor-not-allowed opacity-30 hover:scale-100 hover:bg-transparent",
              )}
            >
              {c.d}
            </button>
          ) : (
            <span key={`v${i}`} />
          ),
        )}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <button type="button" onClick={() => onElegir("")} className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          Borrar
        </button>
        <button
          type="button"
          disabled={fuera(hoy)}
          onClick={() => onElegir(hoy)}
          className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
        >
          Hoy
        </button>
      </div>
    </div>
  );
}

const HORAS = Array.from({ length: 15 }, (_, i) => i + 7); // 07 a 21: el horario de trabajo
const MINUTOS = [0, 15, 30, 45];

function Reloj({ input, onElegir }: { input: HTMLInputElement; onElegir: (v: string, listo: boolean) => void }) {
  const [h, m] = (input.value || "").split(":");
  const [hora, setHora] = useState<number | null>(h ? Number(h) : null);
  const minuto = m ? Number(m) : null;
  const lista = useRef<HTMLDivElement>(null);
  const [todas, setTodas] = useState(() => hora !== null && !HORAS.includes(hora));
  const horas = todas ? Array.from({ length: 24 }, (_, i) => i) : HORAS;

  useLayoutEffect(() => {
    lista.current?.querySelector("[aria-pressed=true]")?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div>
      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Hora</p>
      <div ref={lista} className="grid grid-cols-5 gap-1.5">
        {horas.map((x) => (
          <button
            key={x}
            type="button"
            aria-pressed={hora === x}
            onClick={() => {
              setHora(x);
              onElegir(`${dosDigitos(x)}:${dosDigitos(minuto ?? 0)}`, false);
            }}
            className={cn(
              "rounded-full py-1.5 text-[13px] tabular-nums transition-all duration-150",
              hora === x ? "bg-primary font-bold text-primary-foreground shadow-md" : "bg-secondary/70 text-foreground hover:scale-105 hover:bg-accent",
            )}
          >
            {dosDigitos(x)}
          </button>
        ))}
      </div>
      {!todas && (
        <button type="button" onClick={() => setTodas(true)} className="mt-1.5 text-[11px] font-medium text-primary hover:underline">
          Ver las 24 horas
        </button>
      )}
      <p className="mb-2 mt-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Minutos</p>
      <div className="grid grid-cols-4 gap-1.5">
        {MINUTOS.map((x) => (
          <button
            key={x}
            type="button"
            disabled={hora === null}
            onClick={() => hora !== null && onElegir(`${dosDigitos(hora)}:${dosDigitos(x)}`, true)}
            className={cn(
              "rounded-full py-1.5 text-[13px] tabular-nums transition-all duration-150 disabled:opacity-40",
              minuto === x && hora !== null ? "bg-primary font-bold text-primary-foreground shadow-md" : "bg-secondary/70 text-foreground hover:scale-105 hover:bg-accent",
            )}
          >
            :{dosDigitos(x)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
        <button type="button" onClick={() => onElegir("", true)} className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          Borrar
        </button>
        <span className="text-[11px] text-muted-foreground">También puede escribirla</span>
      </div>
    </div>
  );
}
