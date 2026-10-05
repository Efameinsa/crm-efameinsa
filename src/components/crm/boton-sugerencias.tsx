"use client";

import { usePathname } from "next/navigation";
import { Lightbulb } from "lucide-react";
import Link from "@/components/enlace";

/**
 * El buzón de sugerencias a un clic desde cualquier pantalla (0398). Lleva la
 * pantalla de origen en «desde» para que el formulario ya diga de dónde viene
 * el comentario.
 */
export function BotonSugerencias() {
  const ruta = usePathname();
  const href = ruta?.startsWith("/sugerencias") ? "/sugerencias" : `/sugerencias?desde=${encodeURIComponent(ruta ?? "")}`;
  return (
    <Link
      href={href}
      prefetch={false}
      title="Buzón de sugerencias: cuéntenos qué mejorar, con capturas"
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-[#8B1510]/50 hover:text-[#8B1510]"
    >
      <Lightbulb className="size-3.5" /> <span className="hidden 2xl:inline">Sugerencias</span>
    </Link>
  );
}
