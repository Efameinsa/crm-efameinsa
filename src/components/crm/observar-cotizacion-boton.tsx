"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { observarCotizacion } from "@/lib/acciones/cotizaciones";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * «Observar» sin rechazar (0415, pedido de Brenda 07-10).
 *
 * Hasta hoy gerencia solo podía aprobar o rechazar, y rechazar deja la
 * cotización como histórico: la comercial tenía que hacer otra solo para
 * contestar una pregunta («¿por qué cotizaciones de manera independiente?»).
 * Observar le devuelve la pregunta, la cotización sigue esperando a gerencia y
 * ella responde o la actualiza sobre la misma.
 */
export function ObservarCotizacionBoton({ cotizacionId }: { cotizacionId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [enviando, startTransition] = useTransition();

  function enviar() {
    startTransition(async () => {
      const r = await observarCotizacion({ cotizacionId, nota });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Observación enviada: la comercial responde o actualiza la misma cotización");
      setNota("");
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="sm" variant="outline">Observar</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Observar sin rechazar</DialogTitle>
          <DialogDescription>
            La cotización <b>no se rechaza ni queda como histórico</b>: la comercial lee su observación, responde o
            actualiza la misma cotización, y vuelve a quedar esperando su decisión.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="Observación para la comercial"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={4}
          placeholder="Ej.: ¿por qué se cotizan las máquinas de manera independiente y no como un solo pedido?"
        />
        <DialogFooter>
          <Button onClick={enviar} disabled={enviando || nota.trim().length < 5}>
            {enviando ? "Enviando…" : "Enviar observación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
