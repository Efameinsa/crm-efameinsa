"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, UserCheck } from "lucide-react";
import { pedirExpediente } from "@/lib/acciones/oportunidades";
import { permisoSinPin } from "@/lib/acciones/seguridad";
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
import { CampoCodigo } from "@/components/crm/campo-codigo";

/**
 * EL AVISO QUE FALTABA, Y EL BOTÓN QUE LO DESTRABA.
 *
 * La señorita de postventa atendió a PANASERVICE, entró a anotar la gestión y
 * no pudo: el expediente del mantenimiento es de C4. La base hacía lo correcto
 * —una gestión la anota el dueño del expediente— pero la pantalla le ofrecía
 * el formulario igual y solo al guardar aparecía el error. Eso lo leyó como
 * que el CRM estaba roto.
 *
 * Santos, 09-09: «debería aparecer un aviso, que diga que este cliente es de
 * Ariana y por eso no lo puede gestionar, y un botón que pida cambiar para
 * ella con PIN».
 *
 * Así que acá se dice ANTES de escribir nada: de quién es, por qué no la deja,
 * y qué hacer. El botón pide el código del supervisor porque quitarle un
 * expediente a alguien es una decisión, no un trámite (regla del ing. Carlos,
 * 27-08) — y al dueño anterior le llega el aviso con el motivo escrito.
 *
 * MUEVE EL EXPEDIENTE, NO EL CLIENTE. Se dice en el diálogo, porque es la
 * primera pregunta de quien lo aprieta: la ficha sigue en la cartera de quien
 * estaba (0183).
 */
export function PedirExpedienteBoton({
  oportunidadId,
  duenoNombre,
  duenoCodigo,
  cliente,
  supervisores = [],
  /** Solo el aviso, sin la caja: cuando ya hay un panel que lo explica. */
  compacto = false,
}: {
  oportunidadId: string;
  duenoNombre: string;
  duenoCodigo?: string | null;
  cliente: string;
  supervisores?: { id: string; nombre: string; rol?: string }[];
  compacto?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [sinPinHasta, setSinPinHasta] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const sinPin = sinPinHasta !== null;
  const digitos = pin.replace(/[^0-9]/g, "").length;
  const listo = motivo.trim().length >= 10 && (sinPin || digitos === 4);
  const quien = `${duenoCodigo ? `${duenoCodigo} · ` : ""}${duenoNombre}`;

  useEffect(() => {
    if (!abierto) return;
    permisoSinPin().then((r) => setSinPinHasta(r.hasta));
  }, [abierto]);

  function pedir() {
    if (!listo) return;
    startTransition(async () => {
      const r = await pedirExpediente(oportunidadId, pin, motivo);
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        // El código se quema al usarse: si falló después de validarlo, el que
        // está en pantalla ya no sirve y hay que pedir otro.
        setPin("");
        return;
      }
      toast.success(r.mensaje ?? "El expediente ya es suyo.", { duration: 7000 });
      setAbierto(false);
      setMotivo("");
      setPin("");
      router.refresh();
    });
  }

  const boton = (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5">
            <Lock className="size-4" />
            Pedir el expediente
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pedir el expediente de {cliente}</DialogTitle>
          <DialogDescription>
            Hoy es de <b>{quien}</b>. Si lo pide, pasa a su nombre y podrá anotar la gestión. La ficha del cliente
            <b> no</b> cambia de cartera: sigue siendo de quien es.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="motivo-expediente">Por qué lo necesita</Label>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Lo lee {duenoNombre} en el aviso que le llega. Una frase alcanza.
          </p>
          <Textarea
            id="motivo-expediente"
            rows={2}
            placeholder="ej.: el cliente me llamó a mí, ya le mandé la cotización del preventivo y necesito anotarla"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        {sinPin ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-[12px] leading-snug">
            <p className="font-semibold text-foreground">Hoy no hace falta el código.</p>
            <p className="text-muted-foreground">
              Gerencia lo levantó por el día. El cambio queda registrado igual y {duenoNombre} recibe el aviso.
            </p>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="space-y-1.5">
              <div>
                <Label htmlFor="pin-expediente" className="text-sm">
                  Código del supervisor
                </Label>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Cambia cada 10 min · sirve para una sola vez
                </p>
              </div>
              <CampoCodigo id="pin-expediente" valor={pin} onChange={setPin} tono="amber" />
            </div>
            {/* Con nombre y apellido: un candado que no dice dónde está la
                llave no es un control, es un callejón (27-08). */}
            {supervisores.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                <span className="mr-0.5 inline-flex items-center gap-1 font-semibold text-foreground">
                  <UserCheck className="size-3.5" />
                  Pídaselo a:
                </span>
                {supervisores.map((s) => (
                  <span key={s.id} className="rounded-full bg-background px-2 py-0.5 text-muted-foreground">
                    {s.nombre}
                    {s.rol && s.rol !== "gerencia" ? ` · ${s.rol}` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="sm:flex-col sm:items-stretch sm:gap-2">
          {!listo && (
            <p className="text-[11px] text-muted-foreground">
              {motivo.trim().length < 10
                ? "Escriba por qué lo necesita — con una frase alcanza."
                : "Falta el código del supervisor."}
            </p>
          )}
          <Button onClick={pedir} disabled={!listo || enviando}>
            {enviando ? "Pidiendo…" : "Pedir el expediente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (compacto) return boton;

  return (
    <div className="space-y-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5">
      <p className="text-sm font-semibold text-foreground">Este expediente es de {quien}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Por eso no puede anotar la gestión acá: en el CRM una gestión la registra el dueño del expediente, y así queda
        claro quién atendió. Si el cliente la llamó a usted, pida el expediente —pasa a su nombre, {duenoNombre} recibe
        el aviso con el motivo, y la ficha del cliente no cambia de cartera—.
      </p>
      {boton}
    </div>
  );
}
