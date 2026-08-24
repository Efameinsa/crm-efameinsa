"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { registrarContacto } from "@/lib/acciones/leads";
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
import { Textarea } from "@/components/ui/textarea";

// Cuando a la comercial le entra un WhatsApp o una llamada directa de alguien
// que no está en su cartera.
//
// Hasta el 24-08 lo mandaba por correo a Central, que lo volvía a tipear a mano.
// Ahora lo registra una vez y entra a la bandeja de triaje como cualquier otro
// contacto. Pedido de las comerciales en la capacitación y ratificado por
// gerencia esa misma mañana.
//
// ⚠️ NO se autoasigna. La derivación la decide Central: si el contacto resulta
// ser de su propia cartera, se lo devolverán — pero pasando por la cola, que es
// lo que deja rastro de cuánto le derivan a cada quien. La regla está también en
// la política de la migración 0060, no solo acá.

const CANALES = [
  ["whatsapp", "WhatsApp"],
  ["llamada", "Llamada"],
  ["email", "Correo"],
  ["presencial", "Presencial"],
  ["referido", "Referido"],
  ["otro", "Otro"],
] as const;

export function PasarContactoCentral() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, startTransition] = useTransition();

  function enviar(formData: FormData) {
    // area_destino siempre comercial: este atajo existe para contactos de
    // venta. Lo de servicio técnico o postventa lo sigue tomando Central.
    formData.set("area_destino", "comercial");
    startTransition(async () => {
      const r = await registrarContacto(formData);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Contacto ${r.codigo ?? ""} enviado a Central`.trim());
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Send className="size-3.5" /> Pasar contacto a Central
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pasar un contacto a Central</DialogTitle>
          <DialogDescription>
            Para cuando le escriben o la llaman directamente. Central lo revisa y lo deriva — si es de su cartera, se
            lo devuelve a usted.
          </DialogDescription>
        </DialogHeader>

        <form action={enviar} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pc-nombre">Nombre del contacto *</Label>
              <Input id="pc-nombre" name="nombre_contacto" required autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-canal">¿Por dónde llegó? *</Label>
              <select
                id="pc-canal"
                name="canal"
                required
                defaultValue="whatsapp"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {CANALES.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-telefono">Teléfono</Label>
              <Input id="pc-telefono" name="telefono" inputMode="tel" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-razon">Empresa</Label>
              <Input id="pc-razon" name="razon_social" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-doc">RUC / DNI</Label>
              <Input id="pc-doc" name="num_doc" inputMode="numeric" autoComplete="off" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pc-email">Correo</Label>
              <Input id="pc-email" name="email" type="email" autoComplete="off" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pc-mensaje">¿Qué solicita?</Label>
              <Textarea
                id="pc-mensaje"
                name="mensaje"
                rows={3}
                placeholder="Qué equipo pide, capacidad, para qué uso. Es lo que va a leer quien lo atienda."
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar a Central"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
