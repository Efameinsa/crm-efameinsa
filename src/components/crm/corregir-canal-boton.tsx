"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PhoneIncoming, UserCheck } from "lucide-react";
import { corregirCanalDelLead } from "@/lib/acciones/leads";
import { permisoSinPin } from "@/lib/acciones/seguridad";
import { ETIQUETA_CANAL } from "@/lib/derivados-central";
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
import { cn } from "@/lib/utils";

/**
 * CORREGIR CÓMO ENTRÓ UN CONTACTO.
 *
 * Santos, 08-09: «la señorita de Central lo registró como que entraba por
 * WhatsApp cuando realmente entró por llamada». Es el caso de LOS QUENUALES
 * que encontró el ing. Carlos —le pidió la evidencia del WhatsApp y no
 * existía— y hasta hoy no había forma de arreglarlo.
 *
 * POR QUÉ NO SE LLAMA «CORREGIR». Al lado vive el botón que corrige a QUIÉN se
 * derivó, que hasta hoy se llamaba así, a secas. Dos botones «Corregir» uno al
 * lado del otro son una trampa: confundirlos sería mover la cartera de un
 * comercial creyendo que se arregla una etiqueta. Ahora cada uno dice qué
 * cambia —«Cambiar de comercial» y «Corregir cómo entró»— y ninguno se llama
 * «Corregir» a secas.
 *
 * POR QUÉ PIDE CÓDIGO. El canal es el dato con el que gerencia está auditando
 * («dice WhatsApp, pásame el WhatsApp»). Si se pudiera cambiar sin más, la
 * auditoría dejaría de valer: bastaría con corregirlo después de que se lo
 * pidan. Con código y motivo escrito, corregir un error honesto es fácil y
 * taparlo es imposible sin dejar la firma. Todo eso lo decide la base (0195);
 * esta pantalla solo lo pide bien.
 */

/** En el orden en que entran los contactos de verdad, no alfabético. */
const CANALES = [
  "llamada",
  "whatsapp",
  "email",
  "formulario_web",
  "presencial",
  "referido",
  "facebook",
  "instagram",
  "otro",
];

export function CorregirCanalBoton({
  leadId,
  canalActual,
  contacto,
  supervisores = [],
}: {
  leadId: string;
  canalActual: string;
  contacto: string;
  /** A quién pedirle el código. Sin esto, el campo es un callejón. */
  supervisores?: { id: string; nombre: string; rol?: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [canal, setCanal] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [sinPinHasta, setSinPinHasta] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const sinPin = sinPinHasta !== null;
  const digitos = pin.replace(/[^0-9]/g, "").length;
  const listo = Boolean(canal) && motivo.trim().length >= 10 && (sinPin || digitos === 4);

  useEffect(() => {
    if (!abierto) return;
    permisoSinPin().then((r) => setSinPinHasta(r.hasta));
  }, [abierto]);

  function guardar() {
    if (!listo) return;
    startTransition(async () => {
      const r = await corregirCanalDelLead(leadId, canal, pin, motivo);
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        // El código se quema al usarse: si algo falló después de validarlo, el
        // que está en pantalla ya no sirve y hay que pedir otro.
        setPin("");
        return;
      }
      toast.success(`Queda registrado que entró por ${ETIQUETA_CANAL[canal] ?? canal}`);
      setAbierto(false);
      setCanal("");
      setMotivo("");
      setPin("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5">
            <PhoneIncoming className="size-4" />
            <span className="hidden sm:inline">Corregir cómo entró</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Por dónde entró este contacto?</DialogTitle>
          <DialogDescription>
            <b>{contacto}</b> figura como <b>{ETIQUETA_CANAL[canalActual] ?? canalActual}</b>. Esto no cambia a quién
            está derivado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Entró en realidad por</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {CANALES.filter((c) => c !== canalActual).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCanal(c)}
                className={cn(
                  "cursor-pointer rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors",
                  canal === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
                )}
              >
                {ETIQUETA_CANAL[c] ?? c}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="motivo-canal">Por qué se corrige</Label>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Lo lee gerencia cuando revisa. Una frase alcanza.
          </p>
          <Textarea
            id="motivo-canal"
            rows={2}
            placeholder="ej.: fue una llamada, me equivoqué al registrarla como WhatsApp"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        {sinPin ? (
          /* Gerencia levantó el código por hoy (0111): el servidor no lo va a
             mirar, así que la pantalla tampoco lo pide. El motivo sigue siendo
             obligatorio y la corrección se registra igual. */
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-[12px] leading-snug">
            <p className="font-semibold text-foreground">Hoy no hace falta el código.</p>
            <p className="text-muted-foreground">
              Gerencia lo levantó por el día. La corrección queda registrada igual.
            </p>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="space-y-1.5">
              <div>
                <Label htmlFor="pin-canal" className="text-sm">
                  Código del supervisor
                </Label>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Cambia cada 10 min · sirve para una corrección
                </p>
              </div>
              <CampoCodigo id="pin-canal" valor={pin} onChange={setPin} tono="amber" />
            </div>
            {/* Con nombre y apellido: pedir «el código del supervisor» sin decir
                de quién dejaba a Central sin saber a quién llamar (27-08). */}
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
              {!canal
                ? "Elija por dónde entró en realidad."
                : motivo.trim().length < 10
                  ? "Escriba por qué se corrige — con una frase alcanza."
                  : "Falta el código del supervisor."}
            </p>
          )}
          <Button onClick={guardar} disabled={!listo || enviando}>
            {enviando ? "Guardando…" : "Corregir cómo entró"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
