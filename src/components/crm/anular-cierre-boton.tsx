"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, TriangleAlert } from "lucide-react";
import { anularCierre, cierreEnJuego, type CierreEnJuego } from "@/lib/acciones/informes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * Anular un cierre de venta (reunión con gerencia del 28-08).
 *
 * «Queda el registro de lo que hizo, se equivocó, cargó tres productos en lugar
 * de cuatro. Anula, queda el registro y usted tiene el número 100. Luego el
 * correlativo sigue el 101.» No es borrar: el documento se queda con su número,
 * deja de contar y el comercial emite uno nuevo.
 *
 * TRES FRENOS, EN ESTE ORDEN. Primero se dice qué se lleva por delante —si esa
 * venta ya está contando y si postventa ya está despachando la máquina—.
 * Después hay que escribir por qué, que es lo que va a leer el comercial cuando
 * pregunte qué pasó con su cierre. Y recién al final el código del supervisor,
 * que dura diez minutos: quien se equivocó no anula lo suyo.
 */
export function AnularCierreBoton({ informeId, codigo }: { informeId: string; codigo: string }) {
  const [abierto, setAbierto] = useState(false);
  const [enJuego, setEnJuego] = useState<CierreEnJuego | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  async function abrir(v: boolean) {
    setAbierto(v);
    if (v) {
      setMotivo("");
      setPin("");
      setEnJuego(await cierreEnJuego(informeId));
    }
  }

  function confirmar() {
    empezar(async () => {
      const r = await anularCierre(informeId, motivo, pin);
      if (r.error) {
        toast.error(r.error);
        setPin("");
        return;
      }
      toast.success(`Cierre N.º ${r.codigo ?? codigo} anulado. El comercial tiene que emitir uno nuevo.`);
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={abrir}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Ban className="size-3.5" />
            Anular
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Anular el cierre N.º {codigo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm leading-snug text-muted-foreground">
            El informe no se borra: se queda con su número y su historia, pero deja de contar. El comercial tendrá
            que emitir uno nuevo, y el correlativo sigue de largo.
          </p>

          {enJuego && (
            <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs">
              <p className="font-semibold text-foreground">{enJuego.cliente}</p>
              <p className="mt-0.5 tabular-nums text-muted-foreground">
                {enJuego.moneda} {Number(enJuego.monto).toLocaleString("es-PE")}
                {enJuego.tieneVenta ? " · hoy suma al récord del comercial" : " · todavía no tiene venta registrada"}
              </p>
            </div>
          )}

          {/* Lo que no se puede deshacer desde acá: si el pedido ya salió al
              ERP o postventa ya lo tomó, anular el cierre no lo detiene. */}
          {enJuego && (enJuego.ejecutado || enJuego.enPostventa) && (
            <p className="flex items-start gap-2 rounded-md border-2 border-amber-400 bg-amber-50 p-3 text-xs leading-snug text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 flex-none" />
              <span>
                Este cierre ya salió a postventa
                {enJuego.pedidoErp ? ` con el pedido ${enJuego.pedidoErp}` : ""}. Anularlo acá{" "}
                <strong>no detiene el despacho</strong>: avise también por el ERP y a postventa.
              </span>
            </p>
          )}

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Por qué se anula
            </span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej.: el equipo cotizado no es el que pidió el cliente (apilable)"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
            <span className="text-[11px] text-muted-foreground">
              Queda en el informe. Es lo que va a leer el comercial cuando pregunte qué pasó.
            </span>
          </label>

          <label className="block space-y-1 rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
              Código del supervisor
            </span>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="4 dígitos"
              className="w-32 rounded-md border border-amber-400 bg-background px-2 py-1.5 text-center font-mono text-lg tracking-[0.3em] outline-none"
            />
            <span className="block text-[11px] text-amber-900/80">
              Se lo pide a gerencia: lo tiene en su pantalla y dura diez minutos.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="destructive"
            onClick={confirmar}
            disabled={enviando || pin.length !== 4 || motivo.trim().length < 10}
          >
            {enviando ? "Anulando…" : "Anular el cierre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
