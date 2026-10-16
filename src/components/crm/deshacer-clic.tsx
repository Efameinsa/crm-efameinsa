"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { deshacerClic } from "@/lib/acciones/registro";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * «Deshacer este clic» del registro de acciones (0513). Pide el motivo —queda
 * anotado y se le avisa a quien lo hizo— y, si la base no lo deja (alguien
 * volvió a cambiar lo mismo, algo depende de lo creado), lo dice ahí mismo,
 * dentro del diálogo, con lo que hay que hacer.
 */
export function DeshacerClic({ lote, quien, resumen }: { lote: number; quien: string; resumen: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [problema, setProblema] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const falta = motivo.trim().length < 10 ? "Escriba por qué se deshace (mínimo una frase): le llega a quien lo hizo." : null;

  function deshacer() {
    if (falta) return;
    setProblema(null);
    startTransition(async () => {
      const r = await deshacerClic(lote, motivo);
      if (r.error) {
        setProblema(r.error);
        return;
      }
      toast.success(r.resumen ?? "Listo: se deshizo.", { duration: 8000 });
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
        <Undo2 className="size-3.5" /> Deshacer este clic
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deshacer el clic de {quien}</DialogTitle>
            <DialogDescription>
              {resumen} Todo vuelve a como estaba justo antes. Si después alguien cambió lo mismo, no se pisa: se le avisa
              aquí qué hacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`motivo-${lote}`}>Por qué se deshace</Label>
            <Textarea
              id={`motivo-${lote}`}
              rows={2}
              placeholder="ej.: Ariana lo marcó por error, eligió la máquina equivocada"
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
            <Button onClick={deshacer} disabled={Boolean(falta) || enviando}>
              {enviando ? "Deshaciendo…" : "Deshacer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
