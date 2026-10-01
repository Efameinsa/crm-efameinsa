"use client";

import { useEffect, useState } from "react";

/**
 * «Que tenga la opción para escribir otras actividades» (Lesly, 01-10). En
 * pantalla es un cuadro para escribir; al imprimir sale el texto tal cual (o
 * renglones en blanco para llenar a mano). Lo escrito se recuerda en este
 * navegador para el mismo rango de fechas, por si se cierra la pestaña.
 */
export function OtrasActividades({ clave }: { clave: string }) {
  const [texto, setTexto] = useState("");
  // Lo guardado se trae después de montar: el servidor no lo conoce.
  useEffect(() => {
    let guardado = "";
    try {
      guardado = localStorage.getItem(clave) ?? "";
    } catch {}
    const t = setTimeout(() => setTexto(guardado), 0);
    return () => clearTimeout(t);
  }, [clave]);

  function cambiar(v: string) {
    setTexto(v);
    try {
      if (v.trim()) localStorage.setItem(clave, v);
      else localStorage.removeItem(clave);
    } catch {
      /* sin almacenamiento: se imprime igual */
    }
  }

  return (
    <>
      <textarea
        value={texto}
        onChange={(e) => cambiar(e.target.value)}
        rows={5}
        placeholder="Escriba aquí lo demás que hizo el almacén: inventario, recepción de mercadería, apoyo a una visita, orden del depósito…"
        className="no-imprimir mt-1 w-full rounded-md border border-input bg-background p-2 text-[12px] text-foreground"
      />
      <div className="hidden print:block">
        {texto.trim() ? (
          <p className="mt-1 whitespace-pre-wrap rounded border border-neutral-500 p-2 text-[11px]">{texto.trim()}</p>
        ) : (
          <div className="mt-1 space-y-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="border-b border-neutral-500" />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
