"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2, CheckCheck } from "lucide-react";
import { devolverCierre, reenviarCierreDevuelto } from "@/lib/acciones/devoluciones";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * «Tendrías que rechazarlo y que lo haga bien» (Carlos, 05-09).
 *
 * Central escribe QUÉ está mal —no un motivo de catálogo: el comercial va a
 * leer exactamente eso para corregirlo— y el cierre sale de su cola. El número
 * no se toca: devolver no es anular.
 */
export function DevolverCierreBoton({ informeId, codigo }: { informeId: string; codigo: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  function enviar() {
    empezar(async () => {
      const r = await devolverCierre(informeId, motivo);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Devuelto. El comercial ya lo tiene con el motivo.");
      setAbierto(false);
      setMotivo("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/5 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-500/10 dark:text-amber-500"
      >
        <Undo2 className="size-3.5" /> Devolver al comercial
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Devolver el cierre {codigo}</DialogTitle>
            <DialogDescription>
              El cierre conserva su número: no se anula. Sale de su cola y le queda al comercial para que lo corrija.
            </DialogDescription>
          </DialogHeader>

          <div>
            <label htmlFor="motivo-devolucion" className="mb-1 block text-xs font-medium text-foreground">
              ¿Qué está mal?
            </label>
            <textarea
              id="motivo-devolucion"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="ej. El voucher adjunto es de otro cliente; falta el que corresponde a esta venta."
              className="w-full rounded-md border border-input bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Es lo único que va a leer para arreglarlo. Sea concreto.
            </p>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={enviando || motivo.trim().length < 15}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {enviando ? "Devolviendo…" : "Devolver"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * El otro lado: el comercial ya lo arregló y lo manda de vuelta.
 *
 * No comprueba que de verdad lo haya corregido —el CRM no puede saberlo— pero
 * deja dicho quién y cuándo, y avisa a Central. Si vuelve mal, se devuelve otra
 * vez y las dos vueltas quedan registradas.
 */
export function ReenviarCierreBoton({ informeId }: { informeId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  function enviar() {
    empezar(async () => {
      const r = await reenviarCierreDevuelto(informeId, nota);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Listo. Central lo tiene otra vez en su cola.");
      setAbierto(false);
      setNota("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
      >
        <CheckCheck className="size-3.5" /> Ya lo corregí
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Devolver el cierre a Central</DialogTitle>
            <DialogDescription>Cuente en una línea qué corrigió. Central lo va a ver antes de liberar.</DialogDescription>
          </DialogHeader>
          <textarea
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="ej. Cambié el voucher por el que corresponde a esta venta."
            className="w-full rounded-md border border-input bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
            >
              {enviando ? "Enviando…" : "Enviar a Central"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
