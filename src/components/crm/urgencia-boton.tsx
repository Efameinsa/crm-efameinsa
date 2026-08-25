"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Siren } from "lucide-react";
import { enviarUrgencia } from "@/lib/acciones/leads";
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
 * El recordatorio de urgencia, desde la fila de «Lo que derivé».
 *
 * Es el reemplazo del reclamo por WhatsApp: cuando el cliente vuelve a llamar
 * y le dice a Central que nadie lo atiende (caso Mi Casita Facilita, 25-08),
 * ella dispara desde acá y al comercial le llega en vivo — ventanita que no se
 * cierra sola, sonido y push al celular.
 *
 * El diálogo le dice a Central las dos consecuencias antes de enviar: qué le
 * llega al comercial, y que del segundo aviso en adelante gerencia también se
 * entera. Así el botón no se usa como saludo — es la sirena, no el timbre.
 */
export function UrgenciaBoton({
  leadId,
  contacto,
  comercial,
  totalUrgencias,
}: {
  leadId: string;
  contacto: string;
  /** "C5 · Katerine…" — a quién le va a sonar. */
  comercial: string;
  totalUrgencias: number;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [enviando, startTransition] = useTransition();

  function enviar() {
    startTransition(async () => {
      const r = await enviarUrgencia(leadId, mensaje.trim());
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(
        (r.avisoNumero ?? 1) >= 2
          ? `Aviso urgente n.º ${r.avisoNumero} enviado a ${comercial} — gerencia también fue avisada`
          : `Aviso urgente enviado a ${comercial}`,
      );
      setAbierto(false);
      setMensaje("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            title="Enviar recordatorio de urgencia"
          >
            <Siren className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Recordatorio de urgencia</DialogTitle>
          <DialogDescription>
            A <b>{comercial}</b> le llega ahora mismo un aviso que no se cierra solo —con sonido y
            notificación al celular— de que <b>{contacto}</b> está esperando.
            {totalUrgencias > 0
              ? " Como ya se le avisó antes por este contacto, gerencia también va a enterarse."
              : " Si hiciera falta avisarle una segunda vez, gerencia también se entera."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="motivo-urgencia">Qué pasó (lo lee el comercial)</Label>
          <Textarea
            id="motivo-urgencia"
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Ej. El cliente volvió a escribir por WhatsApp y dice que nadie lo atiende."
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button variant="destructive" disabled={enviando} onClick={enviar}>
            {enviando ? "Enviando…" : "Enviar urgencia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
