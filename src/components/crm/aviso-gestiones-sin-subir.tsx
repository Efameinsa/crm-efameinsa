"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudUpload, Hourglass } from "lucide-react";
import { toast } from "sonner";
import { registrarActividad } from "@/lib/acciones/oportunidades";
import { procesarCola, gestionesPendientes } from "@/lib/outbox-cliente";

/**
 * La chapa ámbar de «gestiones sin subir» (plan 26, pieza 2).
 *
 * Vive junto a los otros avisos del layout: si la cola está vacía no dibuja
 * nada (lo habitual). Cuando hay gestiones guardadas sin internet, lo dice
 * con el conteo y las reintenta sola — al volver el evento `online`, al
 * montar, y cada 30 segundos. Cada subida se anuncia con su nombre, y una
 * rechazada por el servidor se cuenta como lo que es: no se esconde.
 */
export function AvisoGestionesSinSubir() {
  const [pendientes, setPendientes] = useState(0);
  const [subiendo, setSubiendo] = useState(false);

  const procesar = useCallback(async () => {
    try {
      const antes = await gestionesPendientes();
      if (antes.length === 0) {
        setPendientes(0);
        return;
      }
      setSubiendo(true);
      const r = await procesarCola((datos) => registrarActividad(datos as Parameters<typeof registrarActividad>[0]));
      for (const etiqueta of r.subidas) toast.success(`Se subió la gestión guardada: ${etiqueta}`);
      for (const x of r.rechazadas) toast.error(`El servidor rechazó «${x.etiqueta}»: ${x.error}`, { duration: 10000 });
      setPendientes(r.quedan);
    } catch {
      // IndexedDB bloqueada (modo privado): no hay cola que procesar.
      setPendientes(0);
    } finally {
      setSubiendo(false);
    }
  }, []);

  useEffect(() => {
    const alVolver = () => void procesar();
    // El primer intento va diferido (regla react-hooks/set-state-in-effect:
    // nada de setState sincrónico dentro del effect) — 0 ms después da igual.
    const primero = setTimeout(alVolver, 0);
    window.addEventListener("online", alVolver);
    const cada = setInterval(alVolver, 30000);
    return () => {
      clearTimeout(primero);
      window.removeEventListener("online", alVolver);
      clearInterval(cada);
    };
  }, [procesar]);

  if (pendientes === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <Hourglass className="size-4 flex-none" />
      <span className="flex-1">
        <b>
          {pendientes} gestión{pendientes === 1 ? "" : "es"} sin subir
        </b>{" "}
        — guardada{pendientes === 1 ? "" : "s"} en este equipo mientras no había internet. Sube{pendientes === 1 ? "" : "n"} sola{pendientes === 1 ? "" : "s"} al volver la conexión.
      </span>
      <button
        type="button"
        onClick={() => void procesar()}
        disabled={subiendo}
        className="inline-flex items-center gap-1 rounded-md border border-amber-400 px-2 py-1 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50"
      >
        <CloudUpload className="size-3.5" /> {subiendo ? "Subiendo…" : "Reintentar ahora"}
      </button>
    </div>
  );
}
