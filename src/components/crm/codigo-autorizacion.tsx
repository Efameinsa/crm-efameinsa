"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { obtenerPinSupervisor } from "@/lib/acciones/seguridad";
import { cn } from "@/lib/utils";

/**
 * El código de autorización, en la pantalla de quien lo dicta.
 *
 * Es el mismo mecanismo que el de la barra lateral, con más sitio: acá se está
 * mirando esta pantalla porque alguien llamó pidiendo autorización, así que el
 * código puede ocupar el espacio que necesita para dictarse por teléfono sin
 * equivocarse —dígitos grandes, separados, y un reloj que dice cuánto queda—.
 *
 * SIGUE SIN MOSTRARSE SOLO. Hay que pedirlo y se esconde al vencer: un código
 * permanente en pantalla lo ve quien pase por detrás y sale en cualquier
 * captura o demo compartida.
 */

const DURACION = 600;

export function CodigoAutorizacion() {
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
    if (r.error) {
      setError(r.error);
      return;
    }
    setCodigo(r.codigo ?? null);
    setRestante(r.expiraEn ?? 0);
    detener();
    intervalo.current = setInterval(() => {
      setRestante((s) => {
        if (s <= 1) {
          detener();
          setCodigo(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  const minutos = Math.floor(restante / 60);
  const segundos = restante % 60;
  const vuelta = DURACION > 0 ? restante / DURACION : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <KeyRound className="size-3.5" /> Código de autorización
      </p>

      {codigo ? (
        <div className="mt-3 flex items-center gap-4">
          {/* El reloj. Un número que vence sin avisar se dicta tarde y no
              funciona, y quien lo recibe cree que el código está mal. */}
          <span className="relative flex size-16 flex-none items-center justify-center">
            <svg viewBox="0 0 36 36" className="absolute size-16 -rotate-90">
              <circle cx="18" cy="18" r="16" fill="none" strokeWidth="3" className="stroke-secondary" />
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 16}`}
                strokeDashoffset={`${2 * Math.PI * 16 * (1 - vuelta)}`}
                className={cn("transition-[stroke-dashoffset] duration-1000 ease-linear", restante < 60 ? "stroke-destructive" : "stroke-primary")}
              />
            </svg>
            <span className={cn("text-xs font-semibold tabular-nums", restante < 60 ? "text-destructive" : "text-muted-foreground")}>
              {minutos}:{String(segundos).padStart(2, "0")}
            </span>
          </span>

          <span className="font-mono text-4xl font-bold tracking-[0.35em] text-foreground">{codigo}</span>
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={pedir}
            disabled={cargando}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {cargando ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            {restante === 0 && codigo === null && !cargando ? "Ver mi código" : "Pedir otro"}
          </button>
          <p className="mt-2 max-w-prose text-[11px] leading-snug text-muted-foreground">
            Dura diez minutos y sirve para <strong className="text-foreground">una</strong> corrección. Si hacen falta
            dos, son dos códigos.
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
