"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

// Grupo de chips que fija UN searchParam (ej. plataforma=google|meta). Misma
// mecánica que FiltroPeriodo: router.push en transición, sin recarga.
export function ChipsParam({
  nombre,
  opciones,
  valor,
}: {
  nombre: string;
  opciones: { valor: string | null; etiqueta: string }[];
  valor: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, startTransition] = useTransition();

  function elegir(v: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (v === null) params.delete(nombre);
    else params.set(nombre, v);
    params.delete("pagina");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className={cn("flex items-center gap-1 rounded-lg border border-border p-0.5", pendiente && "opacity-60")}>
      {opciones.map((o) => (
        <button
          key={o.valor ?? "_"}
          type="button"
          onClick={() => elegir(o.valor)}
          className={cn(
            "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            (valor ?? null) === o.valor ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-accent",
          )}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}
