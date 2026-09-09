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
 */
export function EditarSolicitudBoton({
  leadId,
  contacto,
  mensaje,
  campania,
}: {
  leadId: string;
  contacto: string;
  mensaje: string | null;
  /** La campaña de Ads, cuando el mensaje son solo datos de origen. */
  campania?: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(mensaje ?? "");
  const [enviando, startTransition] = useTransition();

  // Los contactos de Google Ads llegan con pares "Clave: valor" separados por
  // ·. Eso no lo escribió una persona: si Central lo va a reemplazar por lo que
  // le contó el cliente, arrancar de cero es más honesto que hacerle borrar la
  // línea de plomería a mano.
  const esDeFormulario = Boolean(mensaje && /·/.test(mensaje) && /:/.test(mensaje));
  const listo = texto.trim().length >= 5 && texto.trim() !== (mensaje ?? "").trim();

  function abrir(v: boolean) {
    setAbierto(v);
    if (v) setTexto(esDeFormulario ? "" : mensaje ?? "");
  }

  function guardar() {
    if (!listo) return;
    startTransition(async () => {
      const r = await corregirSolicitudLead(leadId, texto);
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success("Queda anotado lo que pide el cliente");
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
      <DialogContent className="sm:max-w-lg">
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

        <DialogFooter className="sm:flex-col sm:items-stretch sm:gap-2">
          {!listo && (
            <p className="text-[11px] text-muted-foreground">
              {texto.trim().length < 5
                ? "Escriba qué solicita — una frase alcanza."
                : "Es el mismo texto que ya está guardado."}
            </p>
          )}
          <Button onClick={guardar} disabled={!listo || enviando}>
            {enviando ? "Guardando…" : "Guardar lo que pide"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
