"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { agregarCotizacionHistorica } from "@/lib/acciones/cotizaciones-historicas";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Cargar al archivo una cotización de un año anterior.
 *
 * Antes de abrir esto conviene BUSCARLA: la mayoría de los "no está" son
 * documentos que sí están y que no se alcanzaban desde la pantalla vieja. Por
 * eso el diálogo lo dice arriba y el botón vive al lado del buscador, no antes.
 */
export function AgregarCotizacionVieja({ anioActual }: { anioActual: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, startTransition] = useTransition();
  const [f, setF] = useState({
    serie: "EFAMEINSA" as "EFAMEINSA" | "OPEN",
    correlativo: "",
    anio: String(anioActual - 1),
    fecha: "",
    cliente: "",
    monto: "",
    equipos: "",
  });

  function guardar() {
    startTransition(async () => {
      const r = await agregarCotizacionHistorica({
        serie: f.serie,
        correlativo: Number(f.correlativo),
        anio: Number(f.anio),
        fecha: f.fecha || null,
        cliente: f.cliente,
        cuentaId: null,
        monto: f.monto ? Number(f.monto) : null,
        equipos: f.equipos,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Cotización ${r.codigo} agregada a su archivo`);
      setAbierto(false);
      setF({ ...f, correlativo: "", fecha: "", cliente: "", monto: "", equipos: "" });
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="sm" variant="outline">Agregar una de otro año</Button>} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar una cotización de otro año</DialogTitle>
          <DialogDescription>
            Para documentos anteriores que no llegaron con el archivo. <b>Búsquela primero por su número</b>: casi
            todas las que parecen faltar sí están. Las de {anioActual} se hacen en el CRM y llevan su correlativo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="serie">Serie</Label>
            <select
              id="serie"
              value={f.serie}
              onChange={(e) => setF({ ...f, serie: e.target.value as "EFAMEINSA" | "OPEN" })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="EFAMEINSA">EFAMEINSA</option>
              <option value="OPEN">OPEN</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="correlativo">Número</Label>
            <Input
              id="correlativo"
              inputMode="numeric"
              placeholder="1549"
              value={f.correlativo}
              onChange={(e) => setF({ ...f, correlativo: e.target.value.replace(/\D/g, "") })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="anio">Año</Label>
            <Input
              id="anio"
              inputMode="numeric"
              value={f.anio}
              onChange={(e) => setF({ ...f, anio: e.target.value.replace(/\D/g, "") })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fecha">Fecha (opcional)</Label>
            <Input id="fecha" type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="cliente">Cliente</Label>
            <Input
              id="cliente"
              placeholder="SAYWA HOTEL TOURS SCRL"
              value={f.cliente}
              onChange={(e) => setF({ ...f, cliente: e.target.value })}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="monto">Monto sin IGV (opcional)</Label>
            <Input
              id="monto"
              inputMode="decimal"
              placeholder="dejar vacío si la cotización no cerraba un total"
              value={f.monto}
              onChange={(e) => setF({ ...f, monto: e.target.value.replace(/[^\d.]/g, "") })}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="equipos">Equipos cotizados (uno por línea, opcional)</Label>
            <Textarea
              id="equipos"
              rows={3}
              value={f.equipos}
              onChange={(e) => setF({ ...f, equipos: e.target.value })}
              placeholder={"LAVADORA INDUSTRIAL RX180\nSECADORA UT030"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={enviando || !f.cliente.trim() || !f.correlativo || !f.anio}
            onClick={guardar}
          >
            Agregar al archivo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
