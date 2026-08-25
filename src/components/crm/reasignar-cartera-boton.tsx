"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";
import { reasignarCartera } from "@/lib/acciones/cuentas";
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

/**
 * Reasignar la cartera de un cliente, desde la ficha de gerencia.
 *
 * Vive al lado del badge «Cartera de: …» —donde se LEE de quién es— y solo en
 * la vista de gerencia/admin: la regla del 14-08 hace del traspaso una
 * decisión manual de gerencia, y la base lo vuelve a exigir (migración 0080).
 * Mueve el cliente con sus oportunidades abiertas; la historia cerrada se
 * queda con quien la trabajó.
 */
export function ReasignarCarteraBoton({
  cuentaId,
  razonSocial,
  comercialActual,
  comerciales,
}: {
  cuentaId: string;
  razonSocial: string;
  comercialActual: string | null;
  comerciales: { id: string; nombre: string; codigo_comercial: string | null }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [destino, setDestino] = useState("");
  const [enviando, startTransition] = useTransition();

  const opciones = comerciales.filter((c) => c.id !== comercialActual);

  function guardar() {
    if (!destino) return;
    startTransition(async () => {
      const r = await reasignarCartera(cuentaId, destino);
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      const quien = opciones.find((c) => c.id === destino);
      toast.success(
        `${razonSocial} pasó a ${quien?.codigo_comercial ?? ""} ${quien?.nombre ?? ""}` +
          (r.movidas ? ` con ${r.movidas} oportunidad(es) abierta(s)` : ""),
      );
      setAbierto(false);
      setDestino("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-xs">
            <ArrowRightLeft className="size-3.5" />
            Reasignar
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reasignar la cartera</DialogTitle>
          <DialogDescription>
            <b>{razonSocial}</b> pasa al comercial elegido junto con sus oportunidades abiertas. Las ventas y
            gestiones ya cerradas quedan a nombre de quien las trabajó. Los dos comerciales reciben el aviso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="destino-cartera">Pasa a</Label>
          <select
            id="destino-cartera"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Elegir comercial…</option>
            {opciones.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo_comercial ? `${c.codigo_comercial} · ` : ""}
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button disabled={enviando || !destino} onClick={guardar}>
            Reasignar cartera
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
