"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PencilLine, Paperclip, Undo2, X } from "lucide-react";
import { corregirSolicitudLead, firmaParaCorregirSolicitud, quitarAdjuntoLead } from "@/lib/acciones/leads";
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
import { CampoCodigo } from "@/components/crm/campo-codigo";
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
 *
 * Y SE QUITA LO QUE SE ACOPLÓ POR ERROR (0481). Central, 14-10: a PRO-11004
 * se le fue un video de otro chat junto con el del cliente, y acá solo se
 * podía sumar. Cada archivo que ya tiene se puede marcar «Quitar»; pide la
 * misma firma que cambiar el texto y queda en el historial.
 */
export function EditarSolicitudBoton({
  leadId,
  contacto,
  mensaje,
  campania,
  adjuntosQueTiene = 0,
  archivos = [],
}: {
  leadId: string;
  contacto: string;
  mensaje: string | null;
  /** La campaña de Ads, cuando el mensaje son solo datos de origen. */
  campania?: string | null;
  /** Cuántos archivos ya tiene el contacto: para decir «se suman a los N que ya tiene». */
  adjuntosQueTiene?: number;
  /** Los archivos que ya tiene, para poder quitar el que se acopló por error (0481). */
  archivos?: { path: string; nombre: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(mensaje ?? "");
  const [enviando, startTransition] = useTransition();
  const adjuntos = useAdjuntos();
  // La firma que pide cambiar el TEXTO (0354): libre en la bandeja o en los
  // primeros 15 min; después un motivo; con cotización, además el código.
  const [firma, setFirma] = useState<"libre" | "motivo" | "codigo" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [quitar, setQuitar] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (abierto) firmaParaCorregirSolicitud(leadId).then(setFirma);
  }, [abierto, leadId]);

  // Los contactos de Google Ads llegan con pares "Clave: valor" separados por
  // ·. Eso no lo escribió una persona: si Central lo va a reemplazar por lo que
  // le contó el cliente, arrancar de cero es más honesto que hacerle borrar la
  // línea de plomería a mano.
  const esDeFormulario = Boolean(mensaje && /·/.test(mensaje) && /:/.test(mensaje));
  const textoCambio = texto.trim().length >= 5 && texto.trim() !== (mensaje ?? "").trim();
  const hayFotos = adjuntos.archivos.length > 0;
  const hayQueQuitar = quitar.size > 0;
  // Se guarda si cambió el texto O si hay algo que adjuntar: pegar las fotos
  // sin reescribir lo que pide es el caso que motivó esto. Quitar un archivo
  // pide la misma firma que cambiar el texto (0481).
  const reescribe = textoCambio || hayQueQuitar;
  const pideMotivo = reescribe && (firma === "motivo" || firma === "codigo");
  const pideCodigo = reescribe && firma === "codigo";
  const firmaLista =
    !reescribe ||
    (firma !== null && (!pideMotivo || motivo.trim().length >= 5) && (!pideCodigo || pin.replace(/\D/g, "").length === 4));
  const listo = (textoCambio || hayFotos || hayQueQuitar) && firmaLista;

  function abrir(v: boolean) {
    setAbierto(v);
    if (v) setTexto(esDeFormulario ? "" : mensaje ?? "");
    // Al cerrar se descartan las fotos elegidas: la próxima vez el diálogo no
    // puede abrir con las de otro contacto.
    if (!v) {
      adjuntos.limpiar();
      setMotivo("");
      setPin("");
      setQuitar(new Set());
    }
  }

  function alternarQuitar(path: string) {
    setQuitar((antes) => {
      const s = new Set(antes);
      if (s.has(path)) s.delete(path);
      else s.add(path);
      return s;
    });
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
      if (textoCambio || hayFotos) {
        const r = await corregirSolicitudLead(leadId, textoCambio ? texto : null, subida.adjuntos, { motivo, pin });
        if (r.error) {
          toast.error(r.error, { duration: 8000 });
          setPin("");
          return;
        }
      }
      for (const path of quitar) {
        const r = await quitarAdjuntoLead(leadId, path, { motivo, pin });
        if (r.error) {
          toast.error(r.error, { duration: 8000 });
          setPin("");
          router.refresh();
          return;
        }
      }
      toast.success(
        hayQueQuitar && !textoCambio && !hayFotos
          ? quitar.size === 1
            ? "Archivo quitado del contacto"
            : `${quitar.size} archivos quitados del contacto`
          : hayFotos && !textoCambio
          ? `${subida.adjuntos.length === 1 ? "Archivo acoplado" : `${subida.adjuntos.length} archivos acoplados`} al contacto`
          : hayFotos
            ? "Queda anotado lo que pide, con sus archivos"
            : "Queda anotado lo que pide el cliente",
      );
      adjuntos.limpiar();
      setQuitar(new Set());
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

        {pideMotivo && (
          <div className="space-y-1.5">
            <Label htmlFor="solicita-motivo">{textoCambio ? "Por qué lo corrige" : "Por qué quita el archivo"}</Label>
            <Input
              id="solicita-motivo"
              placeholder={
                textoCambio
                  ? "ej.: el cliente volvió a llamar y agregó la secadora"
                  : "ej.: el video era de otro cliente, se acopló por error"
              }
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              Ya está derivado: el motivo queda en el historial y se le avisa a quien lo atiende.
            </p>
          </div>
        )}
        {pideCodigo && (
          <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <Label htmlFor="solicita-pin" className="text-sm">Código del supervisor</Label>
            <p className="text-[11px] leading-snug text-muted-foreground">
              El expediente ya tiene cotización o venta: cambiar lo que pidió el cliente lo autoriza gerencia u operaciones.
            </p>
            <CampoCodigo id="solicita-pin" valor={pin} onChange={setPin} tono="amber" enmascarar />
          </div>
        )}

        {/* Lo que ya tiene, con «Quitar» para el que se acopló por error
            (0481). Solo se marca: se quita al guardar. */}
        {archivos.length > 0 && (
          <div className="space-y-1.5">
            <Label>Archivos que ya tiene</Label>
            <ul className="space-y-1">
              {archivos.map((a) => {
                const marcado = quitar.has(a.path);
                return (
                  <li key={a.path} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                    <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                    <span
                      className={
                        marcado ? "min-w-0 flex-1 truncate text-muted-foreground line-through" : "min-w-0 flex-1 truncate"
                      }
                      title={a.nombre}
                    >
                      {a.nombre}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-1.5 text-[11px]"
                      onClick={() => alternarQuitar(a.path)}
                    >
                      {marcado ? <Undo2 className="size-3" /> : <X className="size-3" />}
                      {marcado ? "Dejarlo" : "Quitar"}
                    </Button>
                  </li>
                );
              })}
            </ul>
            {hayQueQuitar && (
              <p className="text-[11px] leading-snug text-muted-foreground">
                Se quita al guardar. Queda anotado en el historial del contacto
                {firma !== "libre" ? " y se le avisa a quien lo atiende" : ""}.
              </p>
            )}
          </div>
        )}

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
              {texto.trim().length < 5 && !hayQueQuitar
                ? "Escriba qué solicita, o adjunte lo que mandó — con una de las dos alcanza."
                : !firmaLista
                  ? pideCodigo && motivo.trim().length >= 5
                    ? "Falta el código del supervisor."
                    : "Escriba por qué lo corrige."
                  : "Es el mismo texto que ya está guardado. Adjunte algo o cambie el texto."}
            </p>
          )}
          <Button onClick={guardar} disabled={!listo || enviando}>
            {enviando
              ? adjuntos.progreso
                ? `Subiendo ${adjuntos.progreso.hecho + 1} de ${adjuntos.progreso.total}…`
                : "Guardando…"
              : hayQueQuitar && !textoCambio && !hayFotos
                ? quitar.size === 1
                  ? "Quitar el archivo"
                  : `Quitar ${quitar.size} archivos`
                : hayFotos && !textoCambio
                  ? "Acoplar al contacto"
                  : "Guardar lo que pide"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
