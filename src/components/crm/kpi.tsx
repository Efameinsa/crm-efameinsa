"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

interface Props {
  etiqueta: string;
  valor: number;
  sub?: string;
  prefijo?: string;
  alerta?: boolean;
  href?: string;
}

function useConteo(hasta: number, activo: boolean): number {
  const reducido = useReducedMotion();
  const [valor, setValor] = useState(reducido ? hasta : 0);
  const yaAnimo = useRef(false);

  useEffect(() => {
    if (!activo || yaAnimo.current || reducido) return;
    yaAnimo.current = true;
    const inicio = performance.now();
    const duracion = 600;
    let cuadro: number;
    function paso(t: number) {
      const p = Math.min((t - inicio) / duracion, 1);
      setValor(Math.round(hasta * (1 - Math.pow(1 - p, 3))));
      if (p < 1) cuadro = requestAnimationFrame(paso);
    }
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [hasta, activo, reducido]);

  return valor;
}

export function Kpi({ etiqueta, valor, sub, prefijo = "", alerta, href }: Props) {
  const numero = useConteo(valor, true);

  const contenido = (
    <>
      <small className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</small>
      <div className={cn("mt-1 text-2xl font-extrabold tabular-nums tracking-tight", alerta ? "text-primary" : "text-foreground")}>
        {prefijo}
        {numero.toLocaleString("es-PE")}
      </div>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </>
  );

  const clases = "block rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md";

  return href ? (
    <Link href={href} className={clases}>
      {contenido}
    </Link>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}
