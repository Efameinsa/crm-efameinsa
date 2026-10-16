"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Inbox } from "lucide-react";
import { devolverABandeja } from "@/lib/acciones/registro";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * «DEVOLVER A LA BANDEJA» (0514). Central lo pidió por el buzón el 15-10
 * (PRO-11077) y el 16-10 (PRO-11084), y las dos veces hubo que hacerlo a mano
 * en la base. El contacto vuelve a «por repartir» como si no se hubiera
 * derivado; al comercial le llega «Derivación retirada». Si ya lo gestionó, la
 * base no lo deja y aquí se dice qué hacer primero.
 */
export function DevolverABandejaBoton({ leadId, contacto, comercial }: { leadId: string; contacto: string; comercial: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [problema, setProblema] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const falta = motivo.trim().length < 10 ? "Escriba por qué vuelve a la bandeja (mínimo una frase): le llega al comercial." : null;

  function devolver() {
    if (falta) return;
    setProblema(null);
    startTransition(async () => {
      const r = await devolverABandeja(leadId, motivo);
      if (r.error) {
        setProblema(r.error);
        return;
      }
      toast.success(r.resumen ?? "Volvió a la bandeja", { duration: 8000 });
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={() => {
          setMotivo("");
          setProblema(null);
          setAbierto(true);
        }}
      >
        <Inbox className="size-3.5" /> Devolver a la bandeja
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Devolver a {contacto} a la bandeja</DialogTitle>
            <DialogDescription>
              Queda otra vez «por repartir», como si no se hubiera derivado: se quita de {comercial} junto con el expediente y la
              ficha que creó la derivación. A {comercial} le llega un aviso. Úselo cuando se derivó por error o a quien no era.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`motivo-bandeja-${leadId}`}>Por qué vuelve a la bandeja</Label>
            <Textarea
              id={`motivo-bandeja-${leadId}`}
              rows={2}
              placeholder="ej.: era cliente de otra cartera, se derivó a quien no era"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          {problema && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-snug text-destructive">
              {problema}
            </p>
          )}
          <DialogFooter className="sm:flex-col sm:items-stretch sm:gap-2">
            {falta && <p className="text-[11px] text-muted-foreground">{falta}</p>}
            <Button onClick={devolver} disabled={Boolean(falta) || enviando}>
              {enviando ? "Devolviendo…" : "Devolver a la bandeja"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
