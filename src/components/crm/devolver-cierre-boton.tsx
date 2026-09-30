"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2, CheckCheck, ShieldAlert } from "lucide-react";
import { avanceDelCierre, devolverCierre, reenviarCierreDevuelto, type AvanceCierre } from "@/lib/acciones/devoluciones";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * «Tendrías que rechazarlo y que lo haga bien» (Carlos, 05-09).
 *
 * Central escribe QUÉ está mal —no un motivo de catálogo: el comercial va a
 * leer exactamente eso para corregirlo— y el cierre sale de su cola. El número
 * no se toca: devolver no es anular.
 *
 * SI EL PEDIDO YA AVANZÓ, CON CÓDIGO DE GERENCIA (0351). Carlos, 30-09: «el
 * proceso ya avanzó, ya le habían pedido serie… La central no puede hacerlo
 * unilateralmente… ya está en finanzas… va a tener que solicitar eso». Al
 * abrir se pregunta a la base qué pasos ya se hicieron; si hay alguno, la
 * banda dice cuáles y aparece el campo del código.
 */
export function DevolverCierreBoton({ informeId, codigo }: { informeId: string; codigo: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [avance, setAvance] = useState<AvanceCierre | null>(null);
  const [cargandoAvance, setCargandoAvance] = useState(false);
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  const pidePin = avance?.avanzo === true;
  const listo = motivo.trim().length >= 15 && (!pidePin || pin.replace(/\D/g, "").length === 4);

  async function abrir() {
    setAbierto(true);
    setPin("");
    setAvance(null);
    setCargandoAvance(true);
    const r = await avanceDelCierre(informeId);
    setCargandoAvance(false);
    // Si no se pudo leer, la base igual lo exige al devolver: se pide el
    // código recién cuando ella lo diga.
    setAvance(r.avance);
  }

  function enviar() {
    empezar(async () => {
      const r = await devolverCierre(informeId, motivo, pidePin ? pin : undefined);
      if (r.error) {
        // La base es la que manda: si avanzó entre que abrió y envió, que
        // aparezca el campo del código.
        if (/ya avanzó/.test(r.error) && !pidePin) {
          const a = await avanceDelCierre(informeId);
          setAvance(a.avance ?? { avanzo: true, enFinanzas: false, pasos: [] });
        }
        toast.error(r.error);
        return;
      }
      toast.success(
        r.autorizo
          ? `Devuelto con autorización de ${r.autorizo}. Gerencia${avance?.enFinanzas ? " y Finanzas" : ""} ya lo saben.`
          : "Devuelto. El comercial ya lo tiene con el motivo.",
      );
      setAbierto(false);
      setMotivo("");
      setPin("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
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

          {cargandoAvance && <p className="text-xs text-muted-foreground">Revisando si el pedido ya avanzó…</p>}

          {pidePin && (
            <div className="space-y-2.5 rounded-md border border-amber-400/60 bg-amber-50 p-3 dark:bg-amber-500/10">
              <p className="flex items-start gap-2 text-sm font-semibold text-amber-900 dark:text-amber-300">
                <ShieldAlert className="mt-0.5 size-4 flex-none" />
                Este cierre ya avanzó: devolverlo necesita el código de gerencia.
              </p>
              {avance && avance.pasos.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 pl-6">
                  {avance.pasos.map((p) => (
                    <li
                      key={p}
                      className="rounded-full border border-amber-400/60 bg-background px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-300"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              )}
              <p className="pl-6 text-xs text-amber-900/80 dark:text-amber-300/80">
                {avance?.enFinanzas
                  ? "El almacén y Finanzas ya trabajaron sobre este pedido. "
                  : "El almacén ya trabajó sobre este pedido. "}
                Devolverlo lo pone en pausa, así que no lo decide Central sola. Queda escrito quién autorizó y gerencia
                {avance?.enFinanzas ? " y Finanzas se enteran" : " se entera"} con el motivo.
              </p>
              <div className="space-y-1 pl-6">
                <label htmlFor={`dev-pin-${informeId}`} className="block text-xs font-medium text-foreground">
                  Código de autorización
                </label>
                <CampoCodigo valor={pin} onChange={setPin} tono="amber" id={`dev-pin-${informeId}`} enmascarar />
              </div>
            </div>
          )}

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
              disabled={enviando || cargandoAvance || !listo}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {enviando ? "Devolviendo…" : pidePin ? "Devolver con código" : "Devolver"}
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
