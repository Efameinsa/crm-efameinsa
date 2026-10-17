"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Combine, Hand, Loader2 } from "lucide-react";
import { quedarmeConLaCarpeta, unirExpedientes } from "@/lib/acciones/expediente-postventa";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** «Me quedo con esta carpeta» (0530): la responsable visible y tomable. */
export function QuedarmeConLaCarpeta({ oportunidadId, duena }: { oportunidadId: string; duena: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pendiente}
      onClick={() =>
        startTransition(async () => {
          const r = await quedarmeConLaCarpeta(oportunidadId);
          if (r.error) return void toast.error(r.error);
          toast.success(`La carpeta es suya ahora. A ${duena} le llegó el aviso.`);
          router.refresh();
        })
      }
    >
      {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Hand className="size-3.5" />}
      Me quedo con esta carpeta
    </Button>
  );
}

/**
 * Juntar aquí otro expediente abierto del mismo cliente (0530). Se pide el
 * motivo porque lo leen las demás en la historia.
 */
export function UnirAEstaCarpeta({
  haciaId,
  desdeId,
  descripcion,
}: {
  haciaId: string;
  desdeId: string;
  descripcion: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("Es el mismo cliente: una sola carpeta de postventa.");
  const [problema, setProblema] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
        <Combine className="size-3.5" />
        Unir aquí
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unir a esta carpeta</DialogTitle>
            <DialogDescription>
              Todo lo de «{descripcion}» (gestiones, cotizaciones, casos, contactos de Central) pasa a esta carpeta y
              aquel expediente queda archivado. Cada cosa conserva su autora.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-union">Por qué se unen</Label>
            <Textarea id="motivo-union" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
          </div>
          {problema && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{problema}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={pendiente || motivo.trim().length < 10}
              porQue={motivo.trim().length < 10 ? "Escriba el motivo en una frase" : undefined}
              onClick={() =>
                startTransition(async () => {
                  setProblema(null);
                  const r = await unirExpedientes(desdeId, haciaId, motivo);
                  if (r.error) return void setProblema(r.error);
                  toast.success(r.mensaje ?? "Unidos");
                  setAbierto(false);
                  router.refresh();
                })
              }
            >
              {pendiente && <Loader2 className="size-3.5 animate-spin" />}
              Unir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
