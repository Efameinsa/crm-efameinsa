"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { cambiarTipoAtencion } from "@/lib/acciones/atenciones";

/**
 * «ESTO ES UNA PUESTA EN MARCHA» (Ariana, 14-09; 0231).
 *
 * Central registra la llamada como problema técnico cuando el cliente en
 * realidad avisa que el equipo llegó y pide su puesta en marcha (BUNGARENA,
 * SIERRA TRAVEL). Con el tipo equivocado el caso entra al circuito entero
 * —garantía, diagnóstico— y no se puede programar. Un clic lo corrige, solo
 * entre las dos de la pista técnica y solo antes de planificar; después ya
 * hay técnico y trabajo hechos sobre ese tipo.
 *
 * DESDE CUALQUIER TIPO (Carlos, 15-09; 0238): «vamos a suponer que se entrega
 * justo mantenimiento, pero el cliente me dice no, quiero mi puesta en
 * marcha. Lo cambio y me apertura esa secuencia». Un desplegable con los
 * cuatro tipos, siempre antes de planificar.
 */
const TIPOS = [
  ["puesta_en_marcha", "Puesta en marcha — el equipo llegó y hay que instalarlo"],
  ["problema_tecnico", "Problema técnico — falla, garantía o soporte"],
  ["solicitud_mantenimiento", "Mantenimiento — preventivo o correctivo"],
  ["solicitud_repuesto", "Repuesto"],
] as const;
type Tipo = (typeof TIPOS)[number][0];
export function CambiarTipoAtencion({
  atencionId,
  tipo,
  etapa,
}: {
  atencionId: string;
  tipo: string;
  etapa: string;
}) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  if (!["solicitud", "registro", "diagnostico"].includes(etapa)) return null;

  function cambiar(otro: Tipo) {
    startTransition(async () => {
      const r = await cambiarTipoAtencion({ atencionId, tipo: otro });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(
        otro === "puesta_en_marcha"
          ? "Queda como puesta en marcha: se programa directo, sin diagnóstico."
          : otro === "problema_tecnico"
            ? "Queda como problema técnico: sigue el circuito completo."
            : `Queda como ${TIPOS.find((t) => t[0] === otro)?.[1].split(" — ")[0].toLowerCase()}.`,
      );
      setAbierto(false);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        disabled={enviando}
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
        title="Central lo registró con este tipo; si el cliente pidió otra cosa, corríjalo acá"
      >
        <ArrowLeftRight className="size-3" />
        En realidad es otra cosa…
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {TIPOS.filter((t) => t[0] !== tipo).map(([valor, etiqueta]) => (
        <button
          key={valor}
          type="button"
          disabled={enviando}
          onClick={() => cambiar(valor)}
          className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {enviando ? "Cambiando…" : etiqueta.split(" — ")[0]}
        </button>
      ))}
      <button type="button" onClick={() => setAbierto(false)} className="text-[11px] text-muted-foreground hover:underline">
        Cancelar
      </button>
    </span>
  );
}
