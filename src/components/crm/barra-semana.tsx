"use client";

import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { rotuloSemana } from "@/lib/calendario";
import type { ClaveTramo, PulsoSemana, TramoSemana } from "@/lib/pulso-semana";
import { cn } from "@/lib/utils";

/**
 * La barra de la semana. Una sola tira, tres tramos, tres colores.
 *
 * Pedido de gerencia (28-08): «una barra horizontal de progreso de la semana…
 * para que se motiven viendo su barra de progreso». Cada tramo se llena contra
 * su propia referencia —por qué, en `pulso-semana.ts`— así que los tres se leen
 * igual: lleno es bueno.
 *
 * Los colores no son decoración: son los mismos tres en todas partes, y el
 * granate es el de la marca, reservado para el tramo que de verdad cierra el
 * mes. El verde azulado y el ámbar acompañan sin pelearle.
 */

const COLOR: Record<ClaveTramo, { barra: string; punto: string; texto: string }> = {
  gestiones: { barra: "bg-gradient-to-r from-teal-400 to-teal-600", punto: "bg-teal-500", texto: "text-teal-700" },
  cotizaciones: { barra: "bg-gradient-to-r from-amber-300 to-amber-500", punto: "bg-amber-400", texto: "text-amber-700" },
  ventas: { barra: "bg-gradient-to-r from-primary/80 to-primary", punto: "bg-primary", texto: "text-primary" },
};

function valor(t: TramoSemana, n: number): string {
  return t.esDinero ? `US$ ${Math.round(n).toLocaleString("es-PE")}` : n.toLocaleString("es-PE");
}

function Tramo({ tramo, animar }: { tramo: TramoSemana; animar: boolean }) {
  const color = COLOR[tramo.clave];
  const objetivo = tramo.objetivo;
  const pct = objetivo && objetivo > 0 ? Math.round((tramo.hecho / objetivo) * 100) : null;
  // La barra se llena hasta el 100% y no más: lo que pasa de la meta se dice
  // con el número y con el color, no estirando un riel que ya no da.
  const relleno = pct === null ? 0 : Math.min(pct, 100);
  const cumplida = pct !== null && pct >= 100;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className={cn("size-2 rounded-full", color.punto)} aria-hidden />
          {tramo.etiqueta}
        </span>
        {pct !== null && (
          <span className={cn("flex items-center gap-1 text-xs font-bold tabular-nums", cumplida ? color.texto : "text-muted-foreground")}>
            {/* Un riel lleno al 100% y otro al 180% se ven idénticos: el visto
                es lo que distingue «llegó» de «la pasó de largo». */}
            {cumplida && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
            {pct}%
          </span>
        )}
      </div>

      <div
        className="h-3 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={pct ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${tramo.etiqueta}: ${valor(tramo, tramo.hecho)}${objetivo ? ` de ${valor(tramo, objetivo)}` : ""}`}
      >
        <motion.div
          className={cn("h-full rounded-full", color.barra, cumplida && "ring-1 ring-inset ring-white/40")}
          initial={animar ? { width: 0 } : false}
          animate={{ width: `${relleno}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.05 }}
        />
      </div>

      <p className="mt-1.5 truncate text-[11px] text-muted-foreground" title={tramo.origenObjetivo}>
        <span className="font-semibold text-foreground">{valor(tramo, tramo.hecho)}</span>
        {objetivo ? <> de {valor(tramo, objetivo)}</> : <> · {tramo.origenObjetivo}</>}
      </p>
    </div>
  );
}

export function BarraSemana({
  pulso,
  titulo = "Su semana",
  href,
}: {
  pulso: PulsoSemana;
  titulo?: string;
  /** Si se pasa, toda la tarjeta lleva al detalle (lo usa gerencia). */
  href?: string;
}) {
  const reducido = useReducedMotion();
  const cumplidos = pulso.tramos.filter((t) => t.objetivo && t.hecho >= t.objetivo).length;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-foreground">{titulo}</h2>
        <span className="text-[11px] text-muted-foreground">{rotuloSemana(pulso.lunes)}</span>
      </div>

      {/* Los tres tramos juntos, sin separación vertical entre ellos: de lejos
          es una sola tira de color, que es como la pidió gerencia. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-2">
        {pulso.tramos.map((t) => (
          <Tramo key={t.clave} tramo={t} animar={!reducido} />
        ))}
      </div>

      {cumplidos > 0 && (
        <p className="mt-3 text-[11px] font-medium text-muted-foreground">
          {cumplidos === 3
            ? "Semana completa: los tres al día. "
            : `${cumplidos} de 3 ya en meta. `}
          <span className="text-muted-foreground/80">Va hasta el sábado.</span>
        </p>
      )}

      {href && (
        <a href={href} className="mt-3 inline-block text-[11px] font-semibold text-primary hover:underline">
          Ver el detalle de la semana →
        </a>
      )}
    </div>
  );
}
