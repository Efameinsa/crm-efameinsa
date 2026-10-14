"use client";

import { useState, type ReactNode } from "react";
import { BadgeCheck, ChevronDown, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EL SEGUNDO BOTÓN DE LA APERTURA (buzón, Jhon 14-10): en una venta a
 * crédito, desde la misma fila de «Aperturas por confirmar» se abre el
 * expediente con el visto bueno de Finanzas para validar el crédito sin salir
 * de la lista; ya validado, el mismo botón vuelve a mostrar cómo se aprobó
 * (quién, cuándo, letras, comisión, nota) para una segunda revisión.
 */
export function ValidarCreditoApertura({ validado, children }: { validado: boolean; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold",
          validado
            ? "border-[#1E7F4F]/40 bg-[#1E7F4F]/5 text-[#1E7F4F] hover:bg-[#1E7F4F]/10"
            : "border-destructive/50 bg-destructive/5 text-destructive hover:bg-destructive/10",
        )}
      >
        {validado ? <BadgeCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
        {validado ? "Ver la validación del crédito" : "Validar el crédito"}
        <ChevronDown className={cn("size-3.5 transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto && <div className="w-full space-y-3">{children}</div>}
    </>
  );
}
