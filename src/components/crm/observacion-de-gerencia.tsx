"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert } from "lucide-react";
import { responderObservacionCotizacion } from "@/lib/acciones/cotizaciones";
import type { DecisionGerencia } from "@/lib/datos-cotizador";
import { HistorialDecisionesGerencia } from "@/components/crm/historial-decisiones-gerencia";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Lo que gerencia observó sobre esta cotización y la puerta a responderle
 * (0415, pedido de Brenda 07-10). Va arriba del cotizador: ahí mismo se
 * actualizan los precios o condiciones y luego se responde, sin rehacer nada.
 */
export function ObservacionDeGerencia({
  cotizacionId,
  estado,
  conversacion,
}: {
  cotizacionId: string;
  estado: "observada" | "respondida" | null;
  conversacion: DecisionGerencia[];
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [enviando, startTransition] = useTransition();
  if (!estado && conversacion.length === 0) return null;

  function responder() {
    startTransition(async () => {
      const r = await responderObservacionCotizacion({ cotizacionId, texto });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Respuesta enviada a gerencia");
      setTexto("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
        <CircleAlert className="size-3.5" />
        {estado === "respondida"
          ? "Respondió a la observación de gerencia: espera su decisión"
          : "Gerencia observó esta cotización (no la rechazó)"}
      </p>
      <HistorialDecisionesGerencia decisiones={conversacion} titulo="Conversación con gerencia" compacto />
      {estado && (
        <div className="space-y-1.5">
          <Textarea
            aria-label="Respuesta a gerencia"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder="Responda a gerencia. Si hay que cambiar precios o condiciones, hágalo en esta misma cotización y cuéntelo acá."
            className="bg-card"
          />
          <Button size="sm" onClick={responder} disabled={enviando || texto.trim().length < 3}>
            {enviando ? "Enviando…" : estado === "respondida" ? "Enviar otra respuesta" : "Responder a gerencia"}
          </Button>
        </div>
      )}
    </div>
  );
}
