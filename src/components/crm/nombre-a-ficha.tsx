"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * EL NOMBRE DEL CLIENTE LLEVA A SU FICHA (Santos, 02-10): «cuando se haga
 * click en el nombre de cada caso… debe ir directo a la ficha principal», en
 * todas las listas de postventa.
 *
 * Casi todas esas filas ya son un enlace al caso o al pedido, y un <a> no
 * puede ir dentro de otro. Por eso el nombre no es un <a>: ataja el clic
 * (no abre el caso) y navega a la ficha; el resto de la fila sigue abriendo
 * lo de siempre. Ctrl/⌘ + clic la abre en otra pestaña. Sin ficha (cliente
 * escrito a mano, sin enlazar) queda como texto.
 */
export function NombreAFicha({ cuentaId, children, className }: { cuentaId: string | null | undefined; children: ReactNode; className?: string }) {
  const router = useRouter();
  if (!cuentaId) return <>{children}</>;
  const href = `/comercial/cartera/${cuentaId}`;
  const ir = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) window.open(href, "_blank");
    else router.push(href);
  };
  return (
    <span
      role="link"
      tabIndex={0}
      title="Abrir la ficha del cliente"
      onClick={ir}
      onKeyDown={(e) => e.key === "Enter" && ir(e)}
      className={cn("cursor-pointer underline-offset-2 hover:text-primary hover:underline", className)}
    >
      {children}
    </span>
  );
}
