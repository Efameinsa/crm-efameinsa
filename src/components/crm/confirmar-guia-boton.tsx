"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Truck } from "lucide-react";
import { confirmarGuia } from "@/lib/acciones/finanzas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Comprobante = "factura" | "boleta" | "sin_comprobante";
const OPCIONES: { valor: Comprobante; etiqueta: string }[] = [
  { valor: "factura", etiqueta: "Factura" },
  { valor: "boleta", etiqueta: "Boleta" },
  { valor: "sin_comprobante", etiqueta: "Sin comprobante todavía" },
];

/**
 * «OK, TE AUTORIZO, EMITE TU GUÍA DE SALIDA» (0308, audio de gerencia 25-09).
 * Finanzas revisó la apertura que emitió postventa; el almacén recibe el aviso.
 *
 * Y con qué comprobante sale (0384; reunión del 02-10 18:21: «digan sí, procede
 * con la emisión de la guía, y si tiene factura o boleta, nos pongan los
 * números»). El almacén lo lee en la apertura y en el pedido.
 */
export function ConfirmarGuiaBoton({ servicioId, cliente, conSaldo }: { servicioId: string; cliente: string; conSaldo: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [nota, setNota] = useState("");
  const [tipo, setTipo] = useState<Comprobante | null>(null);
  const [numero, setNumero] = useState("");
  const pideNumero = tipo === "factura" || tipo === "boleta";
  const listo = tipo !== null && (!pideNumero || numero.trim().length > 0);

  function enviar() {
    if (!tipo) return void toast.error("Elija con qué comprobante sale: factura, boleta o sin comprobante todavía");
    if (pideNumero && !numero.trim()) return void toast.error(`Escriba el número de la ${tipo}`);
    startTransition(async () => {
      const r = await confirmarGuia(servicioId, nota, { tipo, numero: pideNumero ? numero : "" });
      if (r.error) return void toast.error(r.error);
      toast.success("Confirmado: el almacén ya puede emitir la guía");
      setAbierto(false);
      setNota("");
      setTipo(null);
      setNumero("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Truck className="size-3.5" />
            Confirmar: puede emitir la guía
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Autorizar la guía de salida</DialogTitle>
          <DialogDescription>
            {cliente}. El almacén recibe el aviso y emite la guía.
            {conSaldo ? " Ojo: el pedido todavía tiene saldo antes del despacho; para que salga, gerencia u operaciones autoriza con su código." : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">¿Con qué comprobante sale?</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Comprobante">
              {OPCIONES.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  role="radio"
                  aria-checked={tipo === o.valor}
                  onClick={() => setTipo(o.valor)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    tipo === o.valor ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
                  )}
                >
                  {o.etiqueta}
                </button>
              ))}
            </div>
          </div>
          {pideNumero && (
            <div className="grid gap-1">
              <Label className="text-xs">Número de la {tipo}</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder={tipo === "factura" ? "F001-1234 (si son varias, sepárelas con coma)" : "B001-1234 (si son varias, sepárelas con coma)"} autoFocus />
            </div>
          )}
          <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota para el almacén (opcional). Ej.: la guía a nombre de la sede de Ica" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={pendiente || !listo}>
              {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
              Sí, procede con la guía
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
