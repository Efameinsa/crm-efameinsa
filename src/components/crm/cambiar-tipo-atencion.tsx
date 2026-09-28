"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { cambiarTipoAtencion } from "@/lib/acciones/atenciones";
import {
  AYUDA_TIPO_ATENCION,
  CIRCUITO_POR_TIPO,
  ETIQUETA_ETAPA,
  ETIQUETA_TIPO_ATENCION,
  type TipoAtencion,
} from "@/lib/atenciones";

/**
 * «ESTO ES UNA PUESTA EN MARCHA» (Ariana, 14-09; 0231).
 *
 * Central registra la llamada como problema técnico cuando el cliente en
 * realidad avisa que el equipo llegó y pide su puesta en marcha (BUNGARENA,
 * SIERRA TRAVEL). Con el tipo equivocado el caso entra al circuito que no es.
 *
 * DESDE CUALQUIER TIPO (Carlos, 15-09; 0238): «vamos a suponer que se entrega
 * justo mantenimiento, pero el cliente me dice no, quiero mi puesta en
 * marcha. Lo cambio y me apertura esa secuencia».
 *
 * Y AHORA EL CIRCUITO CAMBIA DE VERDAD (reunión 28-09, 0324): «solo cambia el
 * nombre» fue la queja al reclasificar, porque los cinco tipos recorrían los
 * mismos pasos. Cada tipo tiene su circuito (CIRCUITO_POR_TIPO) y la base
 * acomoda el caso al cambiar; por eso ya no hace falta limitarlo a antes de
 * planificar. Soporte técnico entra como un tipo más.
 */
const TIPOS: TipoAtencion[] = ["problema_tecnico", "soporte_tecnico", "puesta_en_marcha", "solicitud_mantenimiento", "solicitud_repuesto"];

/** Lo que cambia en el circuito, en una frase, para el aviso. */
function resumenDelCircuito(tipo: TipoAtencion): string {
  const c = CIRCUITO_POR_TIPO[tipo];
  const opcionales = (["diagnostico", "atencion"] as const).filter((e) => c[e] === "opcional").map((e) => ETIQUETA_ETAPA[e].toLowerCase());
  const noVan = (["pruebas", "conformidad"] as const).filter((e) => c[e] === "no_corresponde").map((e) => ETIQUETA_ETAPA[e].toLowerCase());
  const partes = [
    opcionales.length ? `${opcionales.join(" y ")} opcional${opcionales.length > 1 ? "es" : ""}` : null,
    noVan.length ? `sin ${noVan.join(" ni ")}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : "circuito completo";
}

export function CambiarTipoAtencion({
  atencionId,
  tipo,
  cerrada = false,
}: {
  atencionId: string;
  tipo: string;
  /** Una atención cerrada ya no cambia de tipo. */
  cerrada?: boolean;
}) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  if (cerrada) return null;

  function cambiar(otro: TipoAtencion) {
    startTransition(async () => {
      const r = await cambiarTipoAtencion({ atencionId, tipo: otro });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(`Queda como ${ETIQUETA_TIPO_ATENCION[otro].toLowerCase()}: ${resumenDelCircuito(otro)}.`, { duration: 7000 });
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
        title="Central lo registró con este tipo; si el cliente pidió otra cosa, corríjalo acá y el circuito cambia con él"
      >
        <ArrowLeftRight className="size-3" />
        En realidad es otra cosa…
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {TIPOS.filter((t) => t !== tipo).map((valor) => (
        <button
          key={valor}
          type="button"
          disabled={enviando}
          onClick={() => cambiar(valor)}
          title={`${AYUDA_TIPO_ATENCION[valor]} · ${resumenDelCircuito(valor)}`}
          className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {enviando ? "Cambiando…" : ETIQUETA_TIPO_ATENCION[valor]}
        </button>
      ))}
      <button type="button" onClick={() => setAbierto(false)} className="text-[11px] text-muted-foreground hover:underline">
        Cancelar
      </button>
    </span>
  );
}
