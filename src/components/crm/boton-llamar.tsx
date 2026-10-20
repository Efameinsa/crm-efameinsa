"use client";

import { useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { plugin, registrarDesdeNavegador } from "@/lib/llamadas-nativo";

/**
 * EL BOTÓN «LLAMAR» (Santos, 19-10-2026). Junto a cada teléfono de una ficha.
 *
 *  · En la app de Android (versión con el plugin `Llamadas`): marca con el plan
 *    corporativo, graba y sube el audio; la persona no hace nada más.
 *  · En el navegador, la PWA o el iPhone: abre el marcador del celular (`tel:`) y,
 *    al volver al CRM, pregunta «¿Cómo te fue?» para anotar la llamada. Ahí no hay audio:
 *    el navegador no puede grabar una llamada.
 *
 * Siempre queda el número como enlace `tel:`: si algo falla, llamar sigue funcionando.
 */
export function BotonLlamar({
  numero,
  cuentaId,
  contactoId,
  etiqueta,
}: {
  numero: string;
  cuentaId?: string;
  contactoId?: string;
  /** Texto a la vista (por defecto, el número). */
  etiqueta?: string;
}) {
  const limpio = numero.replace(/[^\d+]/g, "");
  const pendiente = useRef<{ id: string; inicio: Date } | null>(null);
  const [preguntar, setPreguntar] = useState(false);
  const [minutos, setMinutos] = useState("1");
  const [enviando, setEnviando] = useState(false);

  // Al volver al CRM después de marcar con `tel:`, se pregunta cómo fue.
  useEffect(() => {
    function alVolver() {
      if (document.visibilityState === "visible" && pendiente.current) setPreguntar(true);
    }
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);

  async function llamar(e: React.MouseEvent) {
    e.preventDefault();
    const id = crypto.randomUUID();
    const nativo = await plugin().catch(() => null);
    if (nativo) {
      try {
        await nativo.llamar({ id, numero: limpio, cuentaId, contactoId });
        return;
      } catch (error) {
        toast.error(error instanceof Error && error.message ? error.message : "La app no pudo marcar: se abre el teléfono.");
      }
    }
    pendiente.current = { id, inicio: new Date() };
    window.location.href = `tel:${limpio}`;
  }

  async function anotar(contesto: boolean) {
    const p = pendiente.current;
    if (!p) return;
    setEnviando(true);
    const minutosNum = Number(minutos.replace(",", "."));
    const ok = await registrarDesdeNavegador({
      id: p.id,
      numero: limpio,
      iniciadaAt: p.inicio,
      duracionS: contesto ? Math.max(1, Math.round((Number.isFinite(minutosNum) ? minutosNum : 1) * 60)) : 0,
      cuentaId,
      contactoId,
    });
    setEnviando(false);
    if (!ok) {
      toast.error("No se pudo anotar la llamada. Inténtelo de nuevo.");
      return;
    }
    pendiente.current = null;
    setPreguntar(false);
    toast.success(contesto ? "Llamada anotada." : "Anotado: no contestó.");
  }

  function descartar() {
    pendiente.current = null;
    setPreguntar(false);
  }

  return (
    <>
      <a href={`tel:${limpio}`} onClick={llamar} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
        <Phone className="size-3.5 flex-none" />
        {etiqueta ?? numero}
      </a>
      <Dialog open={preguntar} onOpenChange={(abierto) => !abierto && descartar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cómo le fue con la llamada?</DialogTitle>
            <DialogDescription>{numero}. Cuéntenos qué pasó y queda anotada en la ficha.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              Hablaron unos
              <input
                type="number"
                min={1}
                max={240}
                value={minutos}
                onChange={(e) => setMinutos(e.target.value)}
                className="h-9 w-20 rounded-md border border-border bg-background px-2 text-center"
              />
              minutos
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={enviando} onClick={() => anotar(true)}>
                Contestó
              </Button>
              <Button disabled={enviando} variant="outline" onClick={() => anotar(false)}>
                No contestó
              </Button>
              <Button disabled={enviando} variant="ghost" onClick={descartar}>
                No llegué a llamar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
