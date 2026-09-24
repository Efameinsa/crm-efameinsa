"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Siren } from "lucide-react";
import { enviarUrgenciaFinanzas } from "@/lib/acciones/pedido-central";
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
 * La sirena de Central a Finanzas, desde la fila de «Sus pedidos» (0298).
 *
 * Central, 24-09: «a veces hay pedidos urgentes porque el cliente requiere
 * factura o quieren despachar; necesito mandar una alerta a Finanzas para que
 * se apure, así tal cual con Comercial». Es la hermana de `UrgenciaBoton`
 * (0082): a Finanzas le llega en vivo una ventanita que no se cierra sola,
 * con sonido y push al celular, y el pedido sube al primer lugar de su
 * bandeja con la razón a la vista.
 *
 * El diálogo dice las dos consecuencias antes de enviar: qué le llega a
 * Finanzas, y que del segundo aviso en adelante gerencia también se entera.
 * Es la sirena, no el timbre.
 */
export function UrgenciaFinanzasBoton({
  servicioId,
  cliente,
  totalUrgencias,
  ultimaAt,
}: {
  servicioId: string;
  cliente: string;
  totalUrgencias: number;
  /** Cuándo fue la última, para decirlo en el botón y que Central no bombardee. */
  ultimaAt?: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [enviando, startTransition] = useTransition();

  function enviar() {
    startTransition(async () => {
      const r = await enviarUrgenciaFinanzas(servicioId, mensaje.trim());
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(
        (r.avisoNumero ?? 1) >= 2
          ? `Aviso urgente n.º ${r.avisoNumero} enviado a Finanzas — gerencia también fue avisada`
          : "Aviso urgente enviado a Finanzas: ya le está sonando",
      );
      setAbierto(false);
      setMensaje("");
      router.refresh();
    });
  }

  const hace = ultimaAt ? new Date(ultimaAt).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }) : null;

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-destructive/40 px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            title={hace ? `Ya se le avisó a Finanzas el ${hace} (${totalUrgencias} ${totalUrgencias === 1 ? "vez" : "veces"})` : "Avisarle a Finanzas que este pedido es urgente"}
          >
            <Siren className="size-4" />
            <span className="hidden sm:inline">{totalUrgencias > 0 ? `Urgencia · ${totalUrgencias}` : "Urgencia a Finanzas"}</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apurar a Finanzas</DialogTitle>
          <DialogDescription>
            A <b>Finanzas</b> le llega ahora mismo un aviso que no se cierra solo —con sonido y notificación al celular— de que el pedido de{" "}
            <b>{cliente}</b> es urgente, y el pedido pasa al primer lugar de su bandeja.
            {totalUrgencias > 0
              ? ` Como ya se le avisó antes por este pedido (${hace}), gerencia también va a enterarse.`
              : " Si hiciera falta avisarle una segunda vez, gerencia también se entera."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="motivo-urgencia-finanzas">Por qué es urgente (lo lee Finanzas)</Label>
          <Textarea
            id="motivo-urgencia-finanzas"
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Ej. El cliente necesita la factura hoy para programar el pago. / Quieren despachar mañana temprano."
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
