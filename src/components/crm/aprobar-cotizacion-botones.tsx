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
  /** Precio contra el que se mide la rebaja (migración 0074). */
  precioLista: number | null;
  precioUnitario: number;
  bajoLista: boolean;
  /** Gerencia tiene que decidir sobre este equipo. Desde la migración 0074 eso
   *  significa una sola cosa: el precio pedido está por debajo de la
   *  referencia. */
  requiereAprobacion: boolean;
  esIndustrial: boolean;
}

/**
 * Revisión equipo por equipo, como la pidió el ing. Carlos el 24-08:
 * «me despliega en los 5 ítems. El ítem 1 solamente quiere aprobar, porque los
 * otros 4 le están mandando el precio normal».
 *
 * QUÉ SE DECIDE ACÁ: solo los equipos que van POR DEBAJO del precio de
 * referencia. Ser industrial ya no basta — Carlos lo revirtió el 25-08:
 * «coticemos el precio de lista nada más; la función debería ser cuando quieres
 * reducir ese precio» (migración 0074).
 *
 * POR QUÉ LA COMPARACIÓN SE VE ASÍ DE GRANDE. Con la regla anterior le llegaban
 * industriales cotizados al precio de lista, y la pantalla mostraba referencia y
 * pedido como dos datos chiquitos y parejos. Su reacción, mirándolo en vivo:
 * «me aparece el precio base, precio de lista $8,999, pero YO NO SÉ QUÉ PRECIO
 * ME ESTÁS PIDIENDO». Ahora los dos números y la rebaja —en plata y en
 * porcentaje— son lo primero que se ve de cada equipo.
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

  const porDecidir = useMemo(() => items.filter((i) => i.requiereAprobacion), [items]);
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
            Solo se decide sobre los equipos cotizados <b>por debajo del precio de referencia</b>. Al
            precio de referencia o por encima, el comercial cotiza y envía sin pedir permiso, sea
            industrial o semi-industrial.
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
                  !i.requiereAprobacion && "border-border bg-secondary/40",
                  i.requiereAprobacion && decision === true && "border-[#1E7F4F]/50 bg-[#1E7F4F]/5",
                  i.requiereAprobacion && decision === false && "border-destructive/50 bg-destructive/5",
                  i.requiereAprobacion && decision === undefined && "border-amber-500/50 bg-amber-500/5",
                )}
              >
                <p className="text-sm font-medium text-foreground">
                  {i.cantidad > 1 && <span className="text-muted-foreground">{i.cantidad} × </span>}
                  {i.nombre}
                  <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {i.esIndustrial ? "Industrial" : "Semi-industrial"}
                  </span>
                </p>

                {/* Referencia contra lo que piden, uno al lado del otro. Es el
                    pedido textual del 25-08: «la vista del gerente debe ver
                    cuál es el precio de referencia vs el precio reducido». */}
                <div className="mt-2 grid grid-cols-3 gap-2 text-center tabular-nums">
                  <div className="rounded-md bg-secondary/60 px-2 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Referencia
                    </p>
                    <p className="text-sm text-foreground">
                      {i.precioLista != null ? monto(i.precioLista) : "sin precio cargado"}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded-md px-2 py-1.5",
                      i.bajoLista ? "bg-destructive/10" : "bg-secondary/60",
                    )}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Piden
                    </p>
                    <p
                      className={cn(
                        "text-sm font-bold",
                        i.bajoLista ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {monto(i.precioUnitario)}
                    </p>
                  </div>
                  <div className="rounded-md bg-secondary/60 px-2 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Diferencia
                    </p>
                    {diferencia == null || diferencia === 0 ? (
                      <p className="text-sm text-muted-foreground">—</p>
                    ) : (
                      <p
                        className={cn(
                          "text-sm font-bold",
                          diferencia < 0 ? "text-destructive" : "text-[#1E7F4F]",
                        )}
                      >
                        {diferencia < 0 ? "−" : "+"}
                        {monto(Math.abs(diferencia))}
                        {i.precioLista ? (
                          <span className="block text-[11px] font-semibold">
                            {diferencia < 0 ? "−" : "+"}
                            {Math.abs((diferencia / i.precioLista) * 100).toLocaleString("es-PE", {
                              maximumFractionDigits: 1,
                            })}{" "}
                            %
                          </span>
                        ) : null}
                      </p>
                    )}
                  </div>
                </div>
                {i.cantidad > 1 && diferencia != null && diferencia < 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Por las {i.cantidad} unidades se ceden {monto(Math.abs(diferencia) * i.cantidad)}.
                  </p>
                )}

                {i.requiereAprobacion ? (
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
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Al precio de referencia o por encima — no necesita su aprobación
                  </p>
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
