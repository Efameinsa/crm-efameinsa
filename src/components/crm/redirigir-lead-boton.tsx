"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";
import { redirigirLead } from "@/lib/acciones/leads";
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
 * Corregir a quién se derivó un contacto.
 *
 * Pedido de Central el 25-08: «hubo un error al asignar». El botón vive en la
 * lista de lo que derivó, al lado del contacto, porque es ahí donde se da
 * cuenta del error.
 *
 * Lo que NO hace es decidir si se puede: eso lo resuelve la base (migración
 * 0079) y si se niega, devuelve el motivo en palabras —«ya cotizó», «ya
 * registró gestiones», «al cliente ya se le vendió»— que es lo que Central
 * necesita para saber si le toca pedirlo a gerencia.
 */
export function RedirigirLeadBoton({
  leadId,
  contacto,
  comercialActual,
  comerciales,
}: {
  leadId: string;
  contacto: string;
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
      const r = await redirigirLead(leadId, destino);
      if (r.error) {
        // Los avisos de la base son largos a propósito (explican por qué no se
        // puede y qué hacer), así que se muestran completos.
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success("Contacto reasignado");
      setAbierto(false);
      setDestino("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
            <ArrowRightLeft className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Corregir la derivación</DialogTitle>
          <DialogDescription>
            <b>{contacto}</b> pasa al comercial que corresponda. Solo se puede si el actual todavía no lo trabajó: si
            ya cotizó o registró gestiones, el traspaso lo autoriza gerencia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="destino">Derivar ahora a</Label>
          <select
            id="destino"
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
            Reasignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
