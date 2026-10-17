"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2, Paperclip, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { registrarLiquidacion } from "@/lib/acciones/facturacion";
import { ESTADOS_PAGO_LIQUIDACION } from "@/lib/documentos-finanzas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Estado = (typeof ESTADOS_PAGO_LIQUIDACION)[number][0];

/**
 * FINANZAS SUBE LA LIQUIDACIÓN (0290) — y la ACTUALIZA (0306).
 *
 * Carlos, 23-09: «que la liquidación adjunte su PDF y lo muestre acá». Reunión
 * 25-09 11:44: el cliente paga por partes o pide la factura para pagar, así
 * que la liquidación se va actualizando: «subo la liquidación, pendiente
 * factura… luego la actualizo con el número de factura». Cada subida queda en
 * el historial con lo que dice del pago y de la factura; la última es la que
 * Central ve e imprime.
 */
export function SubirLiquidacion({ servicioId, yaSubida, secundario }: { servicioId: string; yaSubida: boolean; secundario?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [facturaPendiente, setFacturaPendiente] = useState(true);
  const [factura, setFactura] = useState("");
  const [nota, setNota] = useState("");
  const [problema, setProblema] = useState<string | null>(null);

  function enviar() {
    setProblema(null);
    // Solo lo que falta, en una línea («Falta: el PDF · qué dice del pago»).
    const falta: string[] = [];
    if (!archivo) falta.push("el PDF de la liquidación");
    if (!estado) falta.push("qué dice del pago");
    if (!facturaPendiente && factura.trim().length < 4) falta.push("el número de la factura (o marque «factura pendiente»)");
    if (falta.length > 0 || !archivo || !estado) return setProblema(`Falta: ${falta.join(" · ")}.`);
    if (archivo.size > 10 * 1024 * 1024) return setProblema("El archivo pasa de 10 MB: adjunte uno más liviano.");
    startTransition(async () => {
      const path = `liquidaciones/${servicioId}/${crypto.randomUUID()}-${archivo.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
      const { error } = await createClient().storage.from("adjuntos").upload(path, archivo, { contentType: archivo.type || "application/pdf" });
      if (error) return void setProblema(`No se pudo subir el archivo: ${error.message}. Vuelva a intentarlo.`);
      const r = await registrarLiquidacion({
        servicioId,
        path,
        nombre: archivo.name,
        estadoPago: estado,
        factura: facturaPendiente ? null : factura,
        nota: nota.trim() || null,
      });
      if (r.error) return void setProblema(r.error);
      toast.success(yaSubida ? "Liquidación actualizada: Central ya tiene la nueva" : "Liquidación subida: Central ya recibió el aviso");
      setAbierto(false);
      setArchivo(null);
      setEstado(null);
      setFactura("");
      setFacturaPendiente(true);
      setNota("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm" variant={yaSubida || secundario ? "outline" : "default"}>
            <FileUp className="size-3.5" />
            {/* Desde el 17-10 la liquidación la arma el CRM; subir un PDF hecho a mano queda para casos raros. */}
            {secundario ? "Subir un PDF hecho a mano" : yaSubida ? "Subir liquidación actualizada" : "Subir la liquidación (PDF)"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{yaSubida ? "Liquidación actualizada" : "Subir la liquidación"}</DialogTitle>
          <DialogDescription>
            {yaSubida
              ? "Por un pago nuevo o por la factura que ya salió. La anterior queda en el historial."
              : "Central la revisa y la acepta o se la devuelve con el motivo."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>El PDF de la liquidación</Label>
            {archivo ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                <span className="truncate">{archivo.name}</span>
                <button type="button" onClick={() => setArchivo(null)} className="text-muted-foreground hover:text-foreground" aria-label="Quitar el archivo">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent">
                <Paperclip className="size-4" />
                Elegir el archivo (PDF o imagen)
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>¿Qué dice del pago?</Label>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {ESTADOS_PAGO_LIQUIDACION.map(([v, etiqueta, ayuda]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEstado(v)}
                  className={cn(
                    "rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                    estado === v ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  <span className="block text-sm font-semibold text-foreground">{etiqueta}</span>
                  {ayuda}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="liq-factura">Factura</Label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={facturaPendiente} onChange={(e) => setFacturaPendiente(e.target.checked)} />
              Factura pendiente <span className="text-[11px] text-muted-foreground">(Facturación todavía no la emite)</span>
            </label>
            {!facturaPendiente && (
              <Input id="liq-factura" value={factura} onChange={(e) => setFactura(e.target.value)} placeholder="Ej.: F001-00012345" className="font-mono uppercase" />
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="liq-nota">Nota (opcional)</Label>
            <Textarea id="liq-nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: segundo abono; incluye la retención" />
          </div>

          {problema && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-snug text-destructive">{problema}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={pendiente}>
              {pendiente ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
              {pendiente ? "Subiendo…" : "Subir"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
