"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PencilLine } from "lucide-react";
import { corregirSolicitudLead } from "@/lib/acciones/leads";
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
import { CampoAdjuntos, useAdjuntos } from "@/components/crm/campo-adjuntos";

/**
 * EDITAR «QUÉ SOLICITA» sin salir de la bandeja.
 *
 * Central, 09-09: «¿se podría editar lo que solicita el prospecto desde la
 * bandeja de triaje?». El texto se teclea con el cliente al teléfono, así que
 * sale con lo que se alcanzó a anotar; cuando el cliente sigue contando —«son
 * dos, una de 70 kg»— no había dónde ponerlo y terminaba en un WhatsApp al
 * comercial, fuera del CRM.
 *
 * NO PIDE CÓDIGO, a diferencia de «Corregir cómo entró». El canal es el dato
 * con el que gerencia audita; lo que pide el cliente se usa para atenderlo.
 * Pedir un código para completar una frase sería garantizar que nadie la
 * complete.
 *
 * LO QUE ENTRÓ NO SE PIERDE: la 0199 guarda el texto original la primera vez y
 * la tarjeta lo muestra debajo, con quién lo corrigió. Importa sobre todo con
 * los contactos de Google Ads, cuyo mensaje no lo escribió nadie —son los
 * pares «Campaña: … · Ciudad: …» del formulario— y que al reescribirse a mano
 * perderían de dónde vinieron.
 *
 * Y LAS FOTOS QUE LLEGARON POR OTRO CANAL (0227). Central, 11-09: Carlos
 * Timana escribió por la web y a la vez mandó por WhatsApp las fotos de su
 * lavadora. Acá se le pegan al contacto que ya está en la bandeja — la
 * alternativa era registrar un segundo contacto, o sea una ficha repetida.
 * Mismo campo y mismo Ctrl+V que la captura de Central.
 */
export function EditarSolicitudBoton({
  leadId,
  contacto,
  mensaje,
  campania,
  adjuntosQueTiene = 0,
}: {
  leadId: string;
  contacto: string;
  mensaje: string | null;
  /** La campaña de Ads, cuando el mensaje son solo datos de origen. */
  campania?: string | null;
  /** Cuántos archivos ya tiene el contacto: para decir «se suman a los N que ya tiene». */
  adjuntosQueTiene?: number;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(mensaje ?? "");
  const [enviando, startTransition] = useTransition();
  const adjuntos = useAdjuntos();

  // Los contactos de Google Ads llegan con pares "Clave: valor" separados por
  // ·. Eso no lo escribió una persona: si Central lo va a reemplazar por lo que
  // le contó el cliente, arrancar de cero es más honesto que hacerle borrar la
  // línea de plomería a mano.
  const esDeFormulario = Boolean(mensaje && /·/.test(mensaje) && /:/.test(mensaje));
  const textoCambio = texto.trim().length >= 5 && texto.trim() !== (mensaje ?? "").trim();
  const hayFotos = adjuntos.archivos.length > 0;
  // Se guarda si cambió el texto O si hay algo que adjuntar: pegar las fotos
  // sin reescribir lo que pide es el caso que motivó esto.
  const listo = textoCambio || hayFotos;

  function abrir(v: boolean) {
    setAbierto(v);
    if (v) setTexto(esDeFormulario ? "" : mensaje ?? "");
    // Al cerrar se descartan las fotos elegidas: la próxima vez el diálogo no
    // puede abrir con las de otro contacto.
    if (!v) adjuntos.limpiar();
  }

  function guardar() {
    if (!listo) return;
    startTransition(async () => {
      // Las fotos primero: si una subida falla se avisa y NO se guarda nada —
      // mejor reintentar que dejar el texto sin la foto que se vino a pegar.
      const subida = await adjuntos.subir();
      if (subida.error !== null) {
        toast.error(subida.error);
        return;
      }
      const r = await corregirSolicitudLead(leadId, textoCambio ? texto : null, subida.adjuntos);
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(
        hayFotos && !textoCambio
          ? `${subida.adjuntos.length === 1 ? "Archivo acoplado" : `${subida.adjuntos.length} archivos acoplados`} al contacto`
          : hayFotos
            ? "Queda anotado lo que pide, con sus archivos"
            : "Queda anotado lo que pide el cliente",
      );
      adjuntos.limpiar();
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={abrir}>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs">
            <PencilLine className="size-3.5" />
            Editar lo que pide
          </Button>
        }
      />
      {/* El Ctrl+V se escucha en todo el diálogo: al pegar la captura del
          WhatsApp, el cursor está en cualquier campo. */}
      <DialogContent className="sm:max-w-lg" onPaste={adjuntos.onPaste}>
        <DialogHeader>
          <DialogTitle>Qué solicita {contacto}</DialogTitle>
          <DialogDescription>
            Lo lee el comercial antes de llamar. Cuanto más concreto, mejor cotiza.
          </DialogDescription>
        </DialogHeader>

        {/* Lo que entró, a la vista mientras se escribe lo nuevo. No se borra:
            queda guardado igual, y la tarjeta lo sigue mostrando debajo. */}
        {mensaje && (
          <div className="rounded-md border border-dashed border-border bg-secondary/40 p-2.5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {esDeFormulario ? "Lo que trajo el formulario" : "Dice ahora"}
            </p>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{mensaje}</p>
            {esDeFormulario && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Esto lo mandó el formulario de la publicidad, no lo escribió nadie. Se guarda igual: escriba abajo lo
                que el cliente le dijo.
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="solicita">Qué necesita el cliente</Label>
          <Textarea
            id="solicita"
            rows={4}
            placeholder={
              campania
                ? `ej.: llamó por la campaña de ${campania}. Necesita 2 lavadoras de 70 kg para lavandería en Villa El Salvador.`
                : "ej.: necesita 2 lavadoras de 70 kg y una secadora para una lavandería nueva en Piura."
            }
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Qué equipo, cuántos, para qué uso y dónde. Es lo que decide si el comercial cotiza bien a la primera.
          </p>
        </div>

        {/* Las fotos que el cliente mandó por OTRO canal (el WhatsApp mientras
            el contacto entró por la web). Se suman a las que ya tiene; no se
            reemplaza nada. */}
        <div className="space-y-1.5">
          <Label>Fotos o archivos que le mandó por otro canal</Label>
          <CampoAdjuntos
            ctl={adjuntos}
            ayuda={
              adjuntosQueTiene > 0
                ? `Se suman a ${adjuntosQueTiene === 1 ? "el que ya tiene" : `los ${adjuntosQueTiene} que ya tiene`} · hasta 5 por vez, 10 por contacto`
                : "La foto del equipo o de la placa que mandó por WhatsApp · hasta 5 por vez"
            }
          />
        </div>

        <DialogFooter className="sm:flex-col sm:items-stretch sm:gap-2">
          {!listo && (
            <p className="text-[11px] text-muted-foreground">
              {texto.trim().length < 5
                ? "Escriba qué solicita, o adjunte lo que mandó — con una de las dos alcanza."
                : "Es el mismo texto que ya está guardado. Adjunte algo o cambie el texto."}
            </p>
          )}
          <Button onClick={guardar} disabled={!listo || enviando}>
            {enviando
              ? adjuntos.progreso
                ? `Subiendo ${adjuntos.progreso.hecho + 1} de ${adjuntos.progreso.total}…`
                : "Guardando…"
              : hayFotos && !textoCambio
                ? "Acoplar al contacto"
                : "Guardar lo que pide"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
