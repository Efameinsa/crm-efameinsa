"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { aprobarCotizacion, rechazarCotizacion } from "@/lib/acciones/cotizaciones";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AprobarCotizacionBotones({ cotizacionId }: { cotizacionId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [enviando, startTransition] = useTransition();

  function aprobar() {
    startTransition(async () => {
      const r = await aprobarCotizacion(cotizacionId, nota);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Cotización aprobada");
      setAbierto(false);
      router.refresh();
    });
  }

  function rechazar() {
    startTransition(async () => {
      const r = await rechazarCotizacion(cotizacionId, nota);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Cotización rechazada");
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="sm">Revisar</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revisar cotización</DialogTitle>
          <DialogDescription>
            Al aprobar, la nota es opcional. Al rechazar, la nota es obligatoria — le sirve al
            comercial para saber con qué precio volver a cotizar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="nota">Nota</Label>
          <Textarea
            id="nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="ej. Se puede bajar hasta 3800 por unidad, no más."
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={enviando} onClick={rechazar}>
            Rechazar
          </Button>
          <Button disabled={enviando} onClick={aprobar}>
            Aprobar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
