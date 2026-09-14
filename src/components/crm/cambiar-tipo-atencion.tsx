"use client";

import { useTransition } from "react";
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
 */
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
  if (tipo !== "problema_tecnico" && tipo !== "puesta_en_marcha") return null;
  if (!["solicitud", "registro", "diagnostico"].includes(etapa)) return null;
  const otro = tipo === "problema_tecnico" ? "puesta_en_marcha" : "problema_tecnico";
  const etiqueta = otro === "puesta_en_marcha" ? "En realidad es una puesta en marcha" : "En realidad es un problema técnico";

  return (
    <button
      type="button"
      disabled={enviando}
      onClick={() =>
        startTransition(async () => {
          const r = await cambiarTipoAtencion({ atencionId, tipo: otro });
          if (r.error) {
            toast.error(r.error, { duration: 8000 });
            return;
          }
          toast.success(
            otro === "puesta_en_marcha"
              ? "Queda como puesta en marcha: se programa directo, sin diagnóstico."
              : "Queda como problema técnico: sigue el circuito completo.",
          );
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
      title="Central lo registró con este tipo; si el cliente pidió otra cosa, corríjalo acá"
    >
      <ArrowLeftRight className="size-3" />
      {enviando ? "Cambiando…" : etiqueta}
    </button>
  );
}
