"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check } from "lucide-react";
import { pedirAnulacionCierre } from "@/lib/acciones/anulaciones";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Cuando la venta se cae después de emitida.
 *
 * El caso que lo trajo (Carlos, 04-09, 14:30): el cierre 011 de Sierra Travel,
 * facturado, con el pago programado. La gerenta del cliente encontró una
 * cotización más barata de la competencia, frenó la compra, y se renegoció a
 * un precio menor. El cierre ya había pasado por Central, liquidación y
 * postventa.
 *
 *   «Anulamos el pedido y volvemos de cero. Se cayó la venta y todo se cae. El
 *    comercial manda un clip: necesito anular el pedido, y pone todas sus
 *    historias. Le llega al administrador; ingresa, anula.»
 *
 * El comercial NO anula: pide. Anula operaciones con su código, porque anular
 * arrastra la venta, los indicadores de la semana y lo que postventa ya hizo.
 */
export function PedirAnulacionBoton({ informeId, codigo }: { informeId: string; codigo: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pedido, setPedido] = useState(false);
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  function cerrar() {
    setAbierto(false);
    setMotivo("");
    setPedido(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(true)}>
        <Ban className="size-3.5" /> Pedir la anulación
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{pedido ? "Pedido enviado" : `Pedir la anulación del cierre ${codigo ?? ""}`}</DialogTitle>
            <DialogDescription>
              {pedido
                ? "Operaciones lo va a revisar y anular. Después vuelve a cotizar y a cerrar desde cero."
                : "Para cuando la venta se cayó o cambió el precio después de emitir. Usted no anula: pide, y operaciones lo ejecuta."}
            </DialogDescription>
          </DialogHeader>

          {!pedido ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="motivo-anulacion" className="mb-1 block text-xs font-medium text-foreground">
                  ¿Qué pasó con esta venta?
                </label>
                <textarea
                  id="motivo-anulacion"
                  rows={4}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="ej. El cliente frenó el pago porque su gerencia consiguió una cotización más barata; se renegoció a USD 2.300 y hay que rehacer el cierre"
                  className="w-full rounded-md border border-input bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Es lo que va a leer operaciones para decidir. Cuente el caso completo.
                </p>
              </div>
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-900">
                Anular hace que todo vuelva a cero: se cae la venta, cambian los números de la semana y lo que
                postventa haya avanzado con este pedido. El número del cierre no se reutiliza.
              </p>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium text-[#1E7F4F]">
              <Check className="size-4" /> Operaciones y gerencia ya tienen el aviso.
            </p>
          )}

          <DialogFooter>
            {!pedido ? (
              <>
                <Button variant="outline" size="sm" onClick={cerrar} disabled={enviando}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={enviando || motivo.trim().length < 15}
                  onClick={() =>
                    empezar(async () => {
                      const r = await pedirAnulacionCierre(informeId, motivo);
                      if (r.error) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success(r.repetido ? "Ya había un pedido pendiente para este cierre." : "Pedido enviado a operaciones.");
                      setPedido(true);
                    })
                  }
                >
                  {enviando ? "Enviando…" : "Pedir la anulación"}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={cerrar}>
                Listo, cerrar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
