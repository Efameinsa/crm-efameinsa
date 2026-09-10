"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { avisarAlComercialYCerrar } from "@/lib/acciones/avisos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fechaHoraLima } from "@/lib/fechas";

/**
 * La salida que le faltaba a Central cuando el cliente ya lo está atendiendo
 * alguien y vuelve a escribir.
 *
 * Santos, 10-09: «Central acaba de recibir un registro de JORGE DONAIRES a la
 * 1:06 pm y no sabe si asignar, porque ese cliente ya fue gestionado por C5. Si
 * lo deriva, C5 dice que ya lo gestionó y se molesta».
 *
 * Las tres salidas que había eran todas un poco falsas: «Asignar» le llega al
 * comercial como contacto nuevo, «Descartar» dice que el contacto no procedía
 * —y ensucia a la campaña que trajo al cliente— y «Ya está en el sistema» lo
 * cierra en silencio, sin que el comercial se entere de que su cliente
 * insistió. Esta hace lo del medio: le avisa a quien lo tiene y cierra el
 * contacto como repetido.
 *
 * EL TEXTO VIENE ESCRITO. Central registra decenas de contactos al día: si hay
 * que redactar, se termina apretando el botón de al lado. Se puede corregir.
 */
export function AvisarYCerrarBoton({
  leadId,
  cuentaId,
  razonSocial,
  duenio,
  mensaje,
  recibidoAt,
}: {
  leadId: string;
  cuentaId: string;
  razonSocial: string;
  duenio: string;
  mensaje?: string | null;
  recibidoAt?: string | null;
}) {
  const hora = recibidoAt ? fechaHoraLima(recibidoAt) : null;
  const porDefecto =
    `El cliente volvió a escribir${hora ? ` el ${hora}` : ""}` +
    (mensaje?.trim() ? `: «${mensaje.trim()}»` : ". Pidió lo mismo otra vez.");

  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState(porDefecto);
  const [enviando, startTransition] = useTransition();

  function confirmar() {
    startTransition(async () => {
      const r = await avisarAlComercialYCerrar({ leadId, cuentaId, detalle });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Avisado a ${r.comercial ?? "su comercial"}`, {
        description: "Quedó en el historial del cliente y el contacto salió como repetido.",
      });
      setAbierto(false);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}>
        <BellRing className="size-4" />
        Avisarle a {duenio}
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Avisarle a {duenio} que su cliente volvió a escribir</DialogTitle>
            <DialogDescription>
              Queda en el historial de <b>{razonSocial}</b> y le suena la campana. No se le
              asigna nada nuevo, no se abre otro expediente y a usted el contacto le sale de la
              bandeja como <b>repetido</b> — no como descartado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="detalle-aviso">
              Qué le digo
            </label>
            <Textarea
              id="detalle-aviso"
              rows={4}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder="Qué dijo el cliente"
            />
            <p className="text-[11px] text-muted-foreground">
              Mínimo una frase (10 caracteres). Es lo único que va a leer.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={enviando || detalle.trim().length < 10}>
              {enviando ? "Avisando…" : "Avisar y cerrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
