"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Truck } from "lucide-react";
import { confirmarGuia } from "@/lib/acciones/finanzas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * «OK, TE AUTORIZO, EMITE TU GUÍA DE SALIDA» (0308, audio de gerencia 25-09).
 * Finanzas revisó la apertura que emitió postventa; el almacén recibe el aviso.
 */
export function ConfirmarGuiaBoton({ servicioId, cliente, conSaldo }: { servicioId: string; cliente: string; conSaldo: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [nota, setNota] = useState("");

  function enviar() {
    startTransition(async () => {
      const r = await confirmarGuia(servicioId, nota);
      if (r.error) return void toast.error(r.error);
      toast.success("Confirmado: el almacén ya puede emitir la guía");
      setAbierto(false);
      setNota("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Truck className="size-3.5" />
            Confirmar: puede emitir la guía
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Autorizar la guía de salida</DialogTitle>
          <DialogDescription>
            {cliente}. El almacén recibe el aviso y emite la guía.
            {conSaldo ? " Ojo: el pedido todavía tiene saldo antes del despacho; para que salga, gerencia u operaciones autoriza con su código." : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota para el almacén (opcional). Ej.: la guía a nombre de la sede de Ica" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={pendiente}>
              {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
