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
import { MessageCircle, Copy, Check, ExternalLink } from "lucide-react";
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
  /** El número del cliente (E.164 sin +): habilita «Seguir por mi WhatsApp» al marcar «continuado por mi línea». */
  telefono?: string | null;
  /** Compacto: solo el estado vigente + botón "Cambiar", para listas largas (la bandeja de Central). */
  compacto?: boolean;
}

export function TipificarWhatsapp({ leadId, actual, telefono, compacto = false }: Props) {
  const [abierto, setAbierto] = useState(!actual && !compacto);
  const [nota, setNota] = useState("");
  const [pendiente, setPendiente] = useState<TipificacionWhatsapp | null>(null);
  const [enviando, startTransition] = useTransition();
  const [copiado, setCopiado] = useState(false);
  const numeroLimpio = (telefono ?? "").replace(/\D/g, "");
  const numeroLocal = numeroLimpio.startsWith("51") && numeroLimpio.length === 11 ? numeroLimpio.slice(2) : numeroLimpio;

  // «Continuado por mi línea» (Santos, 21-09): jalar el número tiene que ser
  // un clic. Se copia al portapapeles y se abre el WhatsApp del vendedor con
  // el cliente ya elegido; la razón se sigue escribiendo, como pide gerencia.
  function copiarNumero() {
    if (!numeroLocal) return;
    navigator.clipboard?.writeText(numeroLocal).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

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
      toast.success(r.aviso ?? `Marcado como "${ETIQUETA_TIPIFICACION[valor]}"`);
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
              {numeroLimpio && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold text-amber-950">{numeroLocal}</span>
                  <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={copiarNumero}>
                    {copiado ? <Check className="size-3 text-[#1E7F4F]" /> : <Copy className="size-3" />}
                    {copiado ? "Copiado" : "Copiar número"}
                  </Button>
                  <a
                    href={`https://wa.me/${numeroLimpio}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground hover:bg-secondary"
                  >
                    <ExternalLink className="size-3" /> Abrir en mi WhatsApp
                  </a>
                </div>
              )}
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
