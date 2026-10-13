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
  // La última devolución por renglones (0458): lo que hay que corregir, bien a la vista.
  const ultima = conversacion.find((d) => d.resultado === "observada");
  const porCorregir = estado === "observada" ? (ultima?.rechazados.filter((r) => r.nota) ?? []) : [];

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
          : porCorregir.length > 0
            ? `Gerencia devolvió ${porCorregir.length} ${porCorregir.length === 1 ? "renglón" : "renglones"} para corregir — el borrador se conserva`
            : "Gerencia observó esta cotización (no la rechazó)"}
      </p>
      {porCorregir.length > 0 && (
        <div className="space-y-1.5">
          {porCorregir.map((r, n) => (
            <div key={n} className="rounded-md border-2 border-destructive/60 bg-destructive/5 px-3 py-2">
              <p className="text-sm font-bold text-destructive">Corregir: {r.descripcion ?? "renglón"}</p>
              <p className="text-sm text-foreground">&ldquo;{r.nota}&rdquo;</p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Los demás renglones ya están aprobados y se mantienen si no los cambia. Corrija solo lo marcado aquí abajo,
            guarde y responda a gerencia para que lo vuelva a revisar.
          </p>
        </div>
      )}
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
