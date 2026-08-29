"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * El campo donde se teclea el código de autorización de cuatro dígitos.
 *
 * POR QUÉ EXISTE (gerencia, 29-08): «el estilo de letra de los códigos me
 * parece muy delgado». Era un `input` de una línea con la letra fina y las
 * cifras separadas a fuerza de interletraje: se leía peor que el número que
 * operaciones tiene en su pantalla, que sí va en negrita grande
 * (`codigo-autorizacion`). Y este campo se usa en el peor momento posible —el
 * comercial con el teléfono en la oreja, dictando y tecleando a la vez—, así
 * que las cuatro cifras tienen que verse de un vistazo y tiene que quedar claro
 * cuántas faltan.
 *
 * Cuatro casillas y un solo `input`: el campo de verdad está encima,
 * transparente, así que pegar el código, borrar y el teclado numérico del
 * celular siguen funcionando como en cualquier campo, sin manejar foco entre
 * cuatro cajas.
 */

const TONO = {
  primary: { borde: "border-primary/30", activo: "border-primary ring-4 ring-primary/15", texto: "text-foreground" },
  amber: {
    borde: "border-amber-400/50",
    activo: "border-amber-500 ring-4 ring-amber-500/15",
    texto: "text-amber-900",
  },
} as const;

export function CampoCodigo({
  valor,
  onChange,
  tono = "primary",
  autoFocus = false,
  id,
}: {
  valor: string;
  onChange: (v: string) => void;
  /** El color del cuadro que lo contiene: granate en corrección, ámbar en anulaciones. */
  tono?: keyof typeof TONO;
  autoFocus?: boolean;
  /** Para poder enlazarle una etiqueta con `htmlFor`. */
  id?: string;
}) {
  const [enfocado, setEnfocado] = useState(false);
  const t = TONO[tono];
  // La casilla que se está tecleando: la siguiente vacía, o la última si ya
  // están las cuatro.
  const activa = Math.min(valor.length, 3);

  return (
    <div className="relative w-max">
      <input
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={4}
        autoFocus={autoFocus}
        aria-label="Código de autorización de cuatro dígitos"
        className="absolute inset-0 z-10 w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
      />
      <div className="flex gap-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "flex h-14 w-12 items-center justify-center rounded-xl border-2 bg-background font-mono text-3xl font-extrabold tabular-nums transition-all",
              t.borde,
              valor[i] ? t.texto : "text-muted-foreground/25",
              enfocado && i === activa && t.activo,
            )}
          >
            {valor[i] ?? "•"}
          </span>
        ))}
      </div>
    </div>
  );
}
