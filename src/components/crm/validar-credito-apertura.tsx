"use client";

import { useState, type ReactNode } from "react";
import { BadgeCheck, ChevronDown, FolderOpen, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EL SEGUNDO BOTÓN DE LA APERTURA (buzón, Jhon 14-10): en una venta a
 * crédito, desde la misma fila de «Aperturas por confirmar» se abre el
 * expediente con el visto bueno de Finanzas para validar el crédito sin salir
 * de la lista; ya validado, el mismo botón vuelve a mostrar cómo se aprobó
 * (quién, cuándo, letras, comisión, nota) para una segunda revisión.
 *
 * Sin crédito que validar (contado, o quien no valida), el mismo botón es
 * «Ver el expediente»: Contabilidad lo quería en todas las aperturas, no solo
 * en las de crédito (buzón, Facturación 1 15-10).
 */
export function ValidarCreditoApertura({
  validado,
  soloExpediente = false,
  children,
}: {
  validado: boolean;
  soloExpediente?: boolean;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold",
          soloExpediente
            ? "border-border hover:bg-accent"
            : validado
            ? "border-[#1E7F4F]/40 bg-[#1E7F4F]/5 text-[#1E7F4F] hover:bg-[#1E7F4F]/10"
            : "border-destructive/50 bg-destructive/5 text-destructive hover:bg-destructive/10",
        )}
      >
        {soloExpediente ? (
          <FolderOpen className="size-3.5" />
        ) : validado ? (
          <BadgeCheck className="size-3.5" />
        ) : (
          <ShieldAlert className="size-3.5" />
        )}
        {soloExpediente ? "Ver el expediente" : validado ? "Ver la validación del crédito" : "Validar el crédito"}
        <ChevronDown className={cn("size-3.5 transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto && <div className="w-full space-y-3">{children}</div>}
    </>
  );
}
