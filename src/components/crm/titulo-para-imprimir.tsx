"use client";

import { useEffect } from "react";

/**
 * El nombre con que se guarda el PDF (0242). Carlos, 15-09: «acá se tienen
 * que nombrar correctamente». El navegador usa el título del documento como
 * nombre de archivo al guardar como PDF.
 */
export function TituloParaImprimir({ titulo }: { titulo: string }) {
  useEffect(() => {
    const antes = document.title;
    document.title = titulo;
    return () => {
      document.title = antes;
    };
  }, [titulo]);
  return null;
}
