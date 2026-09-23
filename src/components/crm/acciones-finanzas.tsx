"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, BadgeCheck, Loader2, Paperclip, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmarAbono, observarPago } from "@/lib/acciones/finanzas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * Las dos acciones de Finanzas sobre un pedido (0279).
 *
 * CONFIRMAR ABONO. Lo que se confirma es lo que entró a la cuenta, no el
 * voucher: por eso pide el N.º de operación y el banco (con eso se ubica el
 * movimiento en el estado de cuenta), y deja la captura como respaldo, no
 * como prueba. El monto viene propuesto con lo que falta para cubrir la
 * condición de pago —el caso de todos los días— y se corrige si entró otra
 * cifra. Un pedido a crédito recibe varios abonos: cada uno es una fila.
 *
 * OBSERVAR. Cuando el abono no aparece o no cuadra. Avisa a postventa y al
 * comercial con el motivo, y queda visible en el pedido hasta que se confirma.
 */

const MEDIOS = ["BCP", "BBVA", "Interbank", "Scotiabank", "Banco de la Nación", "Yape / Plin", "Efectivo", "Otro"];

export function AccionesFinanzas({
  servicioId,
  cliente,
  moneda,
  sugerido,
  cuenta,
  compacto = false,
}: {
  servicioId: string;
  cliente: string;
  moneda: string;
  /** Lo que falta para cubrir la condición (o el saldo, en cuentas por cobrar). */
  sugerido: number;
  /** «Open Investments» o «Efameinsa»: a qué cuenta del banco mirar. */
  cuenta: string | null;
  compacto?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <DialogoAbono servicioId={servicioId} cliente={cliente} moneda={moneda} sugerido={sugerido} cuenta={cuenta} />
      <DialogoObservar servicioId={servicioId} cliente={cliente} compacto={compacto} />
    </div>
  );
}

function hoyLima() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

function DialogoAbono({
  servicioId,
  cliente,
  moneda,
  sugerido,
  cuenta,
}: {
  servicioId: string;
  cliente: string;
  moneda: string;
  sugerido: number;
  cuenta: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [monto, setMonto] = useState(sugerido > 0 ? sugerido.toFixed(2) : "");
  const [fecha, setFecha] = useState(hoyLima());
  const [operacion, setOperacion] = useState("");
  const [medio, setMedio] = useState("");
  const [nota, setNota] = useState("");
  // El descuento del banco (0292): la comisión que se lleva la transferencia.
  const [descuento, setDescuento] = useState("");
  const [motivoDescuento, setMotivoDescuento] = useState("");
  const [captura, setCaptura] = useState<File | null>(null);
  const simbolo = moneda === "PEN" ? "S/" : "US$";

  function enviar() {
    const n = Number(monto.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return toast.error("Escriba el monto que entró a la cuenta");
    if (!operacion.trim()) return toast.error("Falta el número de operación del banco");
    if (!medio) return toast.error("Elija el banco o el medio por el que entró");
    startTransition(async () => {
      let capturaPath: string | null = null;
      if (captura) {
        const path = `finanzas/${servicioId}/${crypto.randomUUID()}-${captura.name.replace(/[^\w.\-]+/g, "_").slice(0, 60)}`;
        const { error } = await createClient().storage.from("adjuntos").upload(path, captura, { contentType: captura.type || "image/jpeg" });
        if (error) {
          toast.error(`No se pudo subir la captura: ${error.message}`);
          return;
        }
        capturaPath = path;
      }
      const d = Number(descuento.replace(",", "."));
      const r = await confirmarAbono({
        servicioId, monto: n, fecha, operacion, medio, capturaPath, nota,
        descuento: d > 0 ? { monto: d, motivo: motivoDescuento || "Comisión del banco" } : null,
      });
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success("Abono confirmado. Postventa y el comercial ya lo saben.");
      setAbierto(false);
      setOperacion("");
      setNota("");
      setDescuento("");
      setMotivoDescuento("");
      setCaptura(null);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm">
            <BadgeCheck className="size-4" />
            Confirmar abono
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar abono · {cliente}</DialogTitle>
          <DialogDescription>
            Confirme solo lo que ya ve acreditado en el estado de cuenta{cuenta ? ` de ${cuenta}` : ""}. El voucher no basta.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="monto">Monto acreditado ({simbolo})</Label>
              <Input id="monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" />
              {sugerido > 0 && <p className="text-[11px] text-muted-foreground">Propuesto: lo que falta para cubrir la condición.</p>}
            </div>
            <div className="grid gap-1">
              <Label htmlFor="fecha">Fecha del abono</Label>
              <Input id="fecha" type="date" value={fecha} max={hoyLima()} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="operacion">N.º de operación</Label>
              <Input id="operacion" value={operacion} onChange={(e) => setOperacion(e.target.value)} placeholder="ej. 4508520" autoComplete="off" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="medio">Banco o medio</Label>
              <select
                id="medio"
                value={medio}
                onChange={(e) => setMedio(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Elija…</option>
                {MEDIOS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Captura del movimiento (opcional)</Label>
            {captura ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                <span className="truncate">{captura.name}</span>
                <button type="button" onClick={() => setCaptura(null)} className="text-muted-foreground hover:text-foreground" aria-label="Quitar la captura">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent">
                <Paperclip className="size-4" />
                Adjuntar imagen o PDF
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setCaptura(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="descuento">¿El banco descontó algo? (opcional)</Label>
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <Input id="descuento" inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value)} placeholder={`${simbolo} 0.00`} />
              <Input value={motivoDescuento} onChange={(e) => setMotivoDescuento(e.target.value)} placeholder="ej. comisión de la transferencia" />
            </div>
            <p className="text-[11px] text-muted-foreground">Confirme arriba lo que entró. La diferencia queda pendiente y le avisamos al comercial para que la cobre.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nota">Nota (opcional)</Label>
            <Input id="nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej. abono parcial, el cliente paga el resto el viernes" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button size="sm" onClick={enviar} disabled={pendiente}>
              {pendiente ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
              Confirmar abono
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DialogoObservar({ servicioId, cliente, compacto }: { servicioId: string; cliente: string; compacto: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");
  const rapidos = ["No encuentro el abono en el estado de cuenta", "El monto acreditado no coincide con el voucher", "El abono está a nombre de otra persona o empresa"];

  function enviar() {
    if (motivo.trim().length < 10) return toast.error("Escriba qué pasa con el pago (mínimo una frase)");
    startTransition(async () => {
      const r = await observarPago({ servicioId, motivo });
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success("Pago observado. Postventa y el comercial ya lo saben.");
      setAbierto(false);
      setMotivo("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <AlertTriangle className="size-4" />
            {compacto ? "Observar" : "Observar el pago"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Observar el pago · {cliente}</DialogTitle>
          <DialogDescription>Postventa y el comercial reciben el motivo. El pedido no avanza hasta que confirme un abono.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-1.5">
            {rapidos.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setMotivo(r)}
                className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground hover:bg-accent"
              >
                {r}
              </button>
            ))}
          </div>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Qué pasa con el pago y qué necesita para confirmarlo" />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" onClick={enviar} disabled={pendiente}>
              {pendiente ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
              Observar el pago
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
