"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PencilLine } from "lucide-react";
import { corregirSerieParque } from "@/lib/acciones/equipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * «Regularizar la serie del equipo… y lo puedes editar» (gerencia, 28-09).
 * Postventa contrasta con el file, la guía o la placa y la corrige acá; queda
 * escrito quién, cuándo y de dónde salió (0318).
 */
export function CorregirSerieParque({ equipoId, serieActual }: { equipoId: string; serieActual: string | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [serie, setSerie] = useState(serieActual ?? "");
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();

  function guardar() {
    startTransition(async () => {
      const r = await corregirSerieParque(equipoId, serie, motivo);
      if (r.error) return void toast.error(r.error);
      toast.success(`Serie registrada: ${r.serie}. Quedó escrito en el equipo.`);
      setAbierto(false);
      setMotivo("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
      >
        <PencilLine className="size-3.5" /> {serieActual ? "Corregir la serie" : "Registrar la serie"}
      </button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{serieActual ? "Corregir la serie del equipo" : "Registrar la serie del equipo"}</DialogTitle>
            <DialogDescription>
              Escríbala como está en la placa, la guía de remisión o la caja. Queda escrito quién la cambió y de dónde la sacó.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Serie</Label>
              <Input value={serie} onChange={(e) => setSerie(e.target.value.toUpperCase())} className="font-mono" autoFocus />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">
                De dónde sale <span className="text-destructive">*</span>
              </Label>
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: guía EG07-914 / foto de la placa que mandó el cliente" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={pendiente || serie.trim().length < 4 || motivo.trim().length < 5}>
              {pendiente && <Loader2 className="size-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
