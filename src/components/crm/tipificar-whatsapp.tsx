"use client";

// El resultado de la conversación de un WhatsApp de campaña (fase 1, sin API,
// 14-09-2026): interesado, cotizado, no interesado, número equivocado, sin
// respuesta, o "continuado por mi línea" (la excepción de seguir por el
// WhatsApp personal, que el plan de gerencia exige anotar con motivo).
//
// Cada clic agrega una fila nueva a `tipificaciones_whatsapp` — no se corrige
// la anterior, se registra la más reciente — así que este componente siempre
// muestra el ÚLTIMO estado y, debajo, quién y cuándo lo puso.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { tipificarWhatsApp, type TipificacionActual } from "@/lib/acciones/whatsapp-campanas";
import { ETIQUETA_TIPIFICACION, type TipificacionWhatsapp } from "@/lib/whatsapp-marketing";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const OPCIONES: { valor: TipificacionWhatsapp; tono: "verde" | "gris" | "ambar" }[] = [
  { valor: "interesado", tono: "verde" },
  { valor: "cotizado", tono: "verde" },
  { valor: "no_interesado", tono: "gris" },
  { valor: "equivocado", tono: "gris" },
  { valor: "sin_respuesta", tono: "gris" },
  { valor: "continuado_por_mi_linea", tono: "ambar" },
];

const TONO: Record<TipificacionActual["estado"], string> = {
  interesado: "border-[#1E7F4F] bg-[#1E7F4F]/10 text-[#1E7F4F]",
  cotizado: "border-[#1E7F4F] bg-[#1E7F4F]/10 text-[#1E7F4F]",
  no_interesado: "border-border bg-secondary text-muted-foreground",
  equivocado: "border-border bg-secondary text-muted-foreground",
  sin_respuesta: "border-border bg-secondary text-muted-foreground",
  continuado_por_mi_linea: "border-amber-400 bg-amber-50 text-amber-800",
};

interface Props {
  leadId: string;
  actual?: TipificacionActual | null;
  /** Compacto: solo el estado vigente + botón "Cambiar", para listas largas (la bandeja de Central). */
  compacto?: boolean;
}

export function TipificarWhatsapp({ leadId, actual, compacto = false }: Props) {
  const [abierto, setAbierto] = useState(!actual && !compacto);
  const [nota, setNota] = useState("");
  const [pendiente, setPendiente] = useState<TipificacionWhatsapp | null>(null);
  const [enviando, startTransition] = useTransition();

  function elegir(valor: TipificacionWhatsapp) {
    if (valor === "continuado_por_mi_linea") {
      setPendiente(valor);
      return;
    }
    guardar(valor, "");
  }

  function guardar(valor: TipificacionWhatsapp, notaTexto: string) {
    startTransition(async () => {
      const r = await tipificarWhatsApp(leadId, valor, notaTexto);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Marcado como "${ETIQUETA_TIPIFICACION[valor]}"`);
      setPendiente(null);
      setNota("");
      setAbierto(false);
    });
  }

  return (
    <div className="space-y-2">
      {actual && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
              TONO[actual.estado],
            )}
          >
            <MessageCircle className="size-3" />
            {ETIQUETA_TIPIFICACION[actual.estado]}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {actual.registrado_por_nombre ?? "—"} · {fechaHoraLima(actual.registrado_at)}
          </span>
          {actual.nota && <span className="text-[11px] italic text-muted-foreground">«{actual.nota}»</span>}
          {compacto && !abierto && (
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setAbierto(true)}>
              Cambiar
            </Button>
          )}
        </div>
      )}

      {(abierto || !actual) && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {OPCIONES.map((o) => (
              <button
                key={o.valor}
                type="button"
                disabled={enviando}
                onClick={() => elegir(o.valor)}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
                  actual?.estado === o.valor
                    ? TONO[o.valor]
                    : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {ETIQUETA_TIPIFICACION[o.valor]}
              </button>
            ))}
          </div>

          {pendiente === "continuado_por_mi_linea" && (
            <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-2">
              <p className="text-[11px] font-semibold text-amber-900">¿Por qué sigue la conversación fuera del CRM?</p>
              <Textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={2}
                placeholder="Ej.: ya veníamos hablando de otro tema por mi línea antes del anuncio"
                className="bg-card text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setPendiente(null)} disabled={enviando}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={enviando || nota.trim().length === 0}
                  onClick={() => guardar("continuado_por_mi_linea", nota)}
                >
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
