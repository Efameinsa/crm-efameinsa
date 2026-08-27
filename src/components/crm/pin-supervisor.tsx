"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { obtenerPinSupervisor } from "@/lib/acciones/seguridad";
import { cn } from "@/lib/utils";

/**
 * El código con el que gerencia autoriza que Central corrija una derivación.
 *
 * FORMATO DE TOKEN DE BANCO (idea de Darwin, 27-08): cuatro dígitos grandes y
 * un anillo que se va vaciando con los segundos que le quedan. La duración —dos
 * minutos— no se elige acá: la manda la base, que es la misma que después
 * valida (migración 0092). Si el navegador y el servidor tuvieran cada uno su
 * reloj, el supervisor podría estar dictando un código que ya venció.
 *
 * NO SE MUESTRA SOLO. Hay que pedirlo, y se esconde apenas vence. Un código
 * permanente en la barra lateral lo ve quien pase por detrás, sale en cualquier
 * captura y —el caso concreto de esta empresa— se iría en las demos que Carlos
 * hace compartiendo pantalla.
 *
 * Y SE QUEMA AL USARSE: sirve para UNA corrección. Si Central necesita arreglar
 * dos, son dos llamadas. Esa es la parte que sostiene el control; sin ella, con
 * un código se corrigen cinco cosas seguidas.
 */

const DURACION = 120;

export function PinSupervisor({ plegada = false }: { plegada?: boolean }) {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [restante, setRestante] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);

  const detener = useCallback(() => {
    if (intervalo.current) clearInterval(intervalo.current);
    intervalo.current = null;
  }, []);

  useEffect(() => detener, [detener]);

  async function pedir() {
    setCargando(true);
    setError(null);
    const r = await obtenerPinSupervisor();
    setCargando(false);
    if (r.error || !r.codigo) {
      setError(r.error ?? "No se pudo generar el código");
      return;
    }
    setCodigo(r.codigo);
    setRestante(r.expiraEn ?? DURACION);
    detener();
    intervalo.current = setInterval(() => {
      setRestante((s) => {
        if (s <= 1) {
          detener();
          // Vencido: se borra de la pantalla en vez de quedar ahí engañando.
          setCodigo(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  // El anillo del contorno, como el del token: 0% recién pedido, 100% al vencer.
  const avance = codigo ? ((DURACION - restante) / DURACION) * 100 : 0;

  if (plegada) {
    return (
      <button
        type="button"
        onClick={pedir}
        title={codigo ? `Código ${codigo} · ${restante}s` : "PIN de autorización"}
        className="mx-3 flex items-center justify-center rounded-md border border-dashed border-sidebar-accent/60 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        {codigo ? <span className="font-mono text-xs font-bold">{codigo}</span> : <KeyRound className="size-4" />}
      </button>
    );
  }

  return (
    <div className="px-3">
      {!codigo ? (
        <button
          type="button"
          onClick={pedir}
          disabled={cargando}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-dashed border-sidebar-accent/60 px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {cargando ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <KeyRound className="size-4 shrink-0" />}
          PIN de autorización
        </button>
      ) : (
        <div className="rounded-md border border-sidebar-accent/60 bg-sidebar-accent/30 px-3 py-2.5">
          <div className="flex items-center gap-3">
            <span
              className="relative flex size-9 flex-none items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(var(--efameinsa-granate) ${avance}%, transparent ${avance}%)`,
              }}
              aria-hidden
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-sidebar text-[10px] font-bold tabular-nums text-sidebar-foreground">
                {restante}
              </span>
            </span>
            <span className="font-mono text-2xl font-bold tracking-[0.2em] text-sidebar-foreground">{codigo}</span>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-sidebar-foreground/60">
            Sirve para <b>una sola</b> corrección y vence en {restante}s.
          </p>
        </div>
      )}
      {error && <p className="mt-1 px-1 text-[10px] text-red-300">{error}</p>}
      <p className={cn("mt-1 px-1 text-[10px] text-sidebar-foreground/40", codigo && "hidden")}>
        Para autorizar a Central cuando corrige una derivación.
      </p>
    </div>
  );
}
