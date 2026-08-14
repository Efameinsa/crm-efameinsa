"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { asignarLead, buscarDuplicado, type ResultadoDuplicado } from "@/lib/acciones/leads";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Comercial {
  id: string;
  nombre: string;
  codigo_comercial: string | null;
}

interface Props {
  leadId: string;
  telefono: string | null;
  numDoc: string | null;
  comerciales: Comercial[];
}

export function AsignarLeadDialog({ leadId, telefono, numDoc, comerciales }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [duplicado, setDuplicado] = useState<ResultadoDuplicado | null>(null);
  const [comercialId, setComercialId] = useState<string>("");
  const [enviando, startTransition] = useTransition();

  useEffect(() => {
    if (!abierto) return;
    buscarDuplicado({ telefono: telefono ?? undefined, numDoc: numDoc ?? undefined }).then((r) => {
      setDuplicado(r);
      // Sugerencia automática (R3): si es cliente existente con dueño, preseleccionarlo.
      if (r.cuenta) {
        const dueño = comerciales.find((c) => c.nombre === r.cuenta?.comercial_nombre);
        if (dueño) setComercialId(dueño.id);
      }
    });
  }, [abierto, telefono, numDoc, comerciales]);

  function confirmar() {
    if (!comercialId) {
      toast.error("Seleccione un comercial");
      return;
    }
    startTransition(async () => {
      const resultado = await asignarLead(leadId, comercialId);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Lead asignado");
      setAbierto(false);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="sm">Asignar</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar contacto</DialogTitle>
          <DialogDescription>
            Elija el comercial que va a atender este contacto.
          </DialogDescription>
        </DialogHeader>

        {duplicado?.cuenta && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-medium text-primary">
              Cliente existente: {duplicado.cuenta.razon_social}
            </p>
            <p className="text-muted-foreground">
              Cartera de: {duplicado.cuenta.comercial_nombre ?? "sin comercial asignado"}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="comercial">Comercial</Label>
          <Select value={comercialId} onValueChange={(valor) => setComercialId(valor ?? "")}>
            <SelectTrigger id="comercial" className="w-full">
              <SelectValue placeholder="Seleccione…" />
            </SelectTrigger>
            <SelectContent>
              {comerciales.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre} {c.codigo_comercial ? `(${c.codigo_comercial})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button onClick={confirmar} disabled={enviando}>
            {enviando ? "Asignando…" : "Confirmar asignación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
