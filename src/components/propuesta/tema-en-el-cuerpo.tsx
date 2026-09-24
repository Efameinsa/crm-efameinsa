"use client";

import { useEffect } from "react";

/**
 * EL TEMA DE LA PROPUESTA TAMBIÉN EN LAS VENTANAS (24-09).
 *
 * Santos: «la vista de visita a planta también la veo con estilo antiguo».
 * Los diálogos, menús y desplegables se dibujan al final del <body>, fuera
 * del marco `.propuesta`, así que no heredaban sus colores, su letra ni el
 * modo oscuro. Mientras el marco está en pantalla, el <body> lleva las
 * mismas marcas; al salir de la propuesta se quitan.
 */
export function TemaEnElCuerpo({ oscuro }: { oscuro: boolean }) {
  useEffect(() => {
    const b = document.body;
    b.classList.add("propuesta", "propuesta-cuerpo");
    b.classList.toggle("dark", oscuro);
    b.dataset.tema = oscuro ? "oscuro" : "claro";
    return () => {
      b.classList.remove("propuesta", "propuesta-cuerpo", "dark");
      delete b.dataset.tema;
    };
  }, [oscuro]);
  return null;
}
