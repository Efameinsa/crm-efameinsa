"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resolverAprobacionCotizacion } from "@/lib/acciones/cotizaciones";
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
import { cn } from "@/lib/utils";

export interface ItemAprobacion {
  id: string;
  nombre: string;
  cantidad: number;
  precioLista: number | null;
  precioUnitario: number;
  bajoLista: boolean;
}

/**
 * Revisión equipo por equipo, como la pidió el ing. Carlos el 24-08:
 * «me despliega en los 5 ítems. El ítem 1 solamente quiere aprobar, porque los
 * otros 4 le están mandando el precio normal».
 *
 * Los equipos al precio de lista se muestran para dar contexto pero no se
 * deciden: el comercial no pidió nada sobre ellos. La decisión se toma solo
 * sobre los que van por debajo del piso, que es donde está la plata — «en las
 * LG la diferencia es bastante, unos 600 dólares, en algunos casos 800».
 */
export function AprobarCotizacionBotones({
  cotizacionId,
  moneda,
  items,
}: {
  cotizacionId: string;
  moneda: string;
  items: ItemAprobacion[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [decisiones, setDecisiones] = useState<Record<string, boolean>>({});
  const [enviando, startTransition] = useTransition();

  const porDecidir = useMemo(() => items.filter((i) => i.bajoLista), [items]);
  const sinDecidir = porDecidir.filter((i) => !(i.id in decisiones));
  const rechazados = porDecidir.filter((i) => decisiones[i.id] === false);

  function decidir(id: string, aprobado: boolean) {
    setDecisiones((d) => ({ ...d, [id]: aprobado }));
  }

  function guardar() {
    if (sinDecidir.length > 0) {
      toast.error(`Falta decidir ${sinDecidir.length} equipo(s)`);
      return;
    }
    startTransition(async () => {
      const r = await resolverAprobacionCotizacion({
        cotizacionId,
        aprobados: porDecidir.filter((i) => decisiones[i.id]).map((i) => i.id),
        rechazados: rechazados.map((i) => i.id),
        nota,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(
        rechazados.length > 0
          ? `Se rechazaron ${rechazados.length} equipo(s)`
          : "Precios aprobados — el comercial ya puede enviarla",
      );
      setAbierto(false);
      router.refresh();
    });
  }

  const monto = (n: number) => `${moneda} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="sm">Revisar</Button>} />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Revisar precios equipo por equipo</DialogTitle>
          <DialogDescription>
            Solo se decide sobre los equipos que van por debajo del precio de lista. Los demás se
            cotizaron al precio normal y no necesitan su aprobación.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {items.map((i) => {
            const decision = decisiones[i.id];
            const diferencia = i.precioLista != null ? i.precioUnitario - i.precioLista : null;
            return (
              <div
                key={i.id}
                className={cn(
                  "rounded-lg border p-3",
                  !i.bajoLista && "border-border bg-secondary/40",
                  i.bajoLista && decision === true && "border-[#1E7F4F]/50 bg-[#1E7F4F]/5",
                  i.bajoLista && decision === false && "border-destructive/50 bg-destructive/5",
                  i.bajoLista && decision === undefined && "border-amber-500/50 bg-amber-500/5",
                )}
              >
                <p className="text-sm font-medium text-foreground">
                  {i.cantidad > 1 && <span className="text-muted-foreground">{i.cantidad} × </span>}
                  {i.nombre}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
                  <span className="text-muted-foreground">
                    Precio lista {i.precioLista != null ? monto(i.precioLista) : "—"}
                  </span>
                  <span className="font-semibold text-foreground">Pide {monto(i.precioUnitario)}</span>
                  {diferencia != null && diferencia < 0 && (
                    <span className="font-semibold text-destructive">
                      {monto(diferencia)} por unidad
                    </span>
                  )}
                </div>

                {i.bajoLista ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={decision === true ? "default" : "outline"}
                      onClick={() => decidir(i.id, true)}
                    >
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant={decision === false ? "destructive" : "outline"}
                      onClick={() => decidir(i.id, false)}
                    >
                      Rechazar
                    </Button>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">Al precio de lista</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <Label htmlFor="nota">
            Nota {rechazados.length > 0 ? "(obligatoria al rechazar)" : "(opcional)"}
          </Label>
          <Textarea
            id="nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="ej. Se puede bajar hasta 3800 por unidad, no más."
            rows={2}
          />
        </div>

        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">
            {sinDecidir.length > 0
              ? `${sinDecidir.length} equipo(s) sin decidir`
              : rechazados.length > 0
                ? `${rechazados.length} rechazado(s)`
                : "Todo aprobado"}
          </span>
          <Button disabled={enviando || sinDecidir.length > 0} onClick={guardar}>
            Guardar decisión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
