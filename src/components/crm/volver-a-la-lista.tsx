"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * «Volver a clientes» a la MISMA página de la lista (Ariana, 28-09-2026): hacía
 * el barrido de su cartera por la página 5, abría una ficha, registraba la
 * gestión y al volver por el menú «Clientes» caía en la página 1 y tenía que
 * avanzar otra vez hasta la 5. La lista ya guarda la página en la dirección
 * (?pagina=5); lo que faltaba era un camino de vuelta que la conserve.
 *
 * La tabla anota su dirección y la posición del scroll al abrir una ficha
 * (`recordarLista`); la ficha muestra este enlace si hay una anotada.
 */
const CLAVE = "crm:lista-clientes";
const CLAVE_Y = "crm:lista-clientes:y";
const CLAVE_VOLVIENDO = "crm:lista-clientes:volviendo";

function leer(clave: string): string | null {
  try {
    return sessionStorage.getItem(clave);
  } catch {
    return null;
  }
}
function escribir(clave: string, valor: string | null) {
  try {
    if (valor === null) sessionStorage.removeItem(clave);
    else sessionStorage.setItem(clave, valor);
  } catch {
    // modo privado o almacenamiento bloqueado: sin «volver», nada más
  }
}

/** Lo llama la tabla justo antes de abrir una ficha. */
export function recordarLista() {
  escribir(CLAVE, `${location.pathname}${location.search}`);
  escribir(CLAVE_Y, String(Math.round(window.scrollY)));
}

/** Lo llama la tabla al montarse: si se volvió desde una ficha, retoma el scroll. */
export function useRetomarScrollDeLista() {
  useEffect(() => {
    if (leer(CLAVE_VOLVIENDO) !== "1") return;
    escribir(CLAVE_VOLVIENDO, null);
    const y = Number(leer(CLAVE_Y) ?? 0);
    if (y > 0) requestAnimationFrame(() => window.scrollTo({ top: y }));
  }, []);
}

export function VolverALaLista() {
  const router = useRouter();
  const [destino, setDestino] = useState<string | null>(null);

  useEffect(() => {
    // Solo se lee en el navegador; en el servidor no hay sesión que recordar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDestino(leer(CLAVE));
  }, []);

  if (!destino) return null;
  const pagina = new URLSearchParams(destino.split("?")[1] ?? "").get("pagina");

  return (
    <button
      type="button"
      onClick={() => {
        escribir(CLAVE_VOLVIENDO, "1");
        router.push(destino);
      }}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Volver a clientes{pagina && pagina !== "1" ? ` · página ${pagina}` : ""}
    </button>
  );
}
