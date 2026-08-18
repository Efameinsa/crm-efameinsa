"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const CX = 100;
const CY = 100;
const RADIO = 80;
const GROSOR = 14;

function punto(fraccion: number): { x: number; y: number } {
  const theta = Math.PI * (1 - fraccion);
  return { x: CX + RADIO * Math.cos(theta), y: CY - RADIO * Math.sin(theta) };
}

const INICIO = punto(0);
const FIN = punto(1);
const PATH_ARCO = `M ${INICIO.x} ${INICIO.y} A ${RADIO} ${RADIO} 0 0 1 ${FIN.x} ${FIN.y}`;
const MARCAS = [0, 0.5, 1].map(punto);

// Igual que en kpi.tsx: cuenta desde el valor mostrado hasta el nuevo cada
// vez que cambia (antes animaba una sola vez y el filtro de período no
// actualizaba el monto).
function useConteo(hasta: number, duracionMs: number, reducido: boolean | null): number {
  const [valor, setValor] = useState(reducido ? hasta : 0);
  const actual = useRef(reducido ? hasta : 0);

  useEffect(() => {
    if (reducido) {
      actual.current = hasta;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValor(hasta);
      return;
    }
    const desde = actual.current;
    if (desde === hasta) return;
    const inicio = performance.now();
    let cuadro: number;
    function paso(t: number) {
      const p = Math.min((t - inicio) / duracionMs, 1);
      const v = Math.round(desde + (hasta - desde) * (1 - Math.pow(1 - p, 3)));
      actual.current = v;
      setValor(v);
      if (p < 1) cuadro = requestAnimationFrame(paso);
    }
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [hasta, duracionMs, reducido]);

  return valor;
}

export function Velocimetro({ ventasMes, meta }: { ventasMes: number; meta: number | null }) {
  const reducido = useReducedMotion();
  const monto = useConteo(ventasMes, 700, reducido);

  if (meta === null || meta <= 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-8">
        <p className="text-3xl font-extrabold tabular-nums text-foreground">US$ {monto.toLocaleString("es-PE")}</p>
        <p className="text-xs text-muted-foreground">Meta mensual sin definir — la asigna gerencia.</p>
      </div>
    );
  }

  const pct = Math.round((ventasMes / meta) * 100);
  const fraccion = Math.min(Math.max(ventasMes / meta, 0), 1);
  const enMeta = pct >= 100;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 105" className="w-full max-w-[280px]" aria-hidden>
        <path d={PATH_ARCO} fill="none" strokeWidth={GROSOR} strokeLinecap="round" className="stroke-secondary" />
        <motion.path
          d={PATH_ARCO}
          fill="none"
          strokeWidth={GROSOR}
          strokeLinecap="round"
          className={cn(enMeta ? "stroke-[#1E7F4F]" : "stroke-primary")}
          initial={reducido ? false : { pathLength: 0 }}
          animate={{ pathLength: fraccion }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
        {MARCAS.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} className="fill-muted-foreground/40" />
        ))}
      </svg>
      <div className="-mt-4 flex flex-col items-center">
        <p className="text-3xl font-extrabold tabular-nums text-foreground">US$ {monto.toLocaleString("es-PE")}</p>
        <p className="text-xs text-muted-foreground">
          de US$ {meta.toLocaleString("es-PE")} · <span className="tabular-nums">{pct}%</span>
        </p>
      </div>
    </div>
  );
}
