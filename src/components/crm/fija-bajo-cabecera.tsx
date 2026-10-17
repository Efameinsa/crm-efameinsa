"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Algo que queda fijo al bajar, JUSTO DEBAJO de la barra superior del CRM.
 * Con `sticky top-0` quedaba escondido detrás de ella: la barra también es
 * sticky y su alto cambia (una fila en pantalla ancha, dos en 1280 px y en
 * el celular), así que se mide en vivo.
 */
export function FijaBajoCabecera({ className, children }: { className?: string; children: React.ReactNode }) {
  const [alto, setAlto] = useState(0);
  useEffect(() => {
    const cabecera = document.querySelector("header");
    if (!cabecera) return;
    const medir = () => setAlto(cabecera.getBoundingClientRect().height);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(cabecera);
    return () => obs.disconnect();
  }, []);
  return (
    <div className={cn("sticky z-10", className)} style={{ top: alto }}>
      {children}
    </div>
  );
}
