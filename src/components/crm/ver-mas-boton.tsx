"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * «Ver más» que avisa que está trabajando.
 *
 * Pedir más contactos vuelve a preguntarle al servidor —los contadores de cada
 * cajón se calculan sobre el período entero—, así que hay una espera real de
 * uno o dos segundos. Con un enlace normal, en esa espera no pasaba nada en
 * pantalla y Central lo leyó como que se congelaba (04-09).
 *
 * Con `useTransition` el botón se apaga y dice «Cargando…» desde el primer
 * milisegundo. La espera es la misma; la diferencia es que se ve.
 */
export function VerMasBoton({
  href,
  etiqueta,
  variante = "principal",
}: {
  href: string;
  etiqueta: string;
  variante?: "principal" | "discreta";
}) {
  const router = useRouter();
  const [cargando, empezar] = useTransition();

  return (
    <button
      type="button"
      disabled={cargando}
      onClick={() => empezar(() => router.push(href, { scroll: false }))}
      className={cn(
        "inline-flex items-center gap-1.5 transition-opacity disabled:opacity-70",
        variante === "principal"
          ? "rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:bg-primary/90"
          : "text-muted-foreground underline-offset-2 hover:underline",
      )}
    >
      {cargando && <Loader2 className="size-3.5 animate-spin" />}
      {cargando ? "Cargando…" : etiqueta}
    </button>
  );
}
