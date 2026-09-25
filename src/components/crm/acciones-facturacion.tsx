"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCheck, FileCheck2, Loader2, Paperclip, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { levantarObservacion, observarExpediente, registrarFactura } from "@/lib/acciones/facturacion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * LO QUE HACE FACTURACIÓN CON UN PEDIDO (0306, reunión 25-09 11:44).
 *
 * Gerencia: «el facturador revisa todo el expediente —cotización, orden de
 * compra, cierre y pedido—; si está mal, para; si está bien, continúa:
 * factura, sube y cierra su tema». Dos acciones: registrar la factura
 * emitida o observar el expediente con el motivo (le llega a Central).
 */

const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

export function RegistrarFactura({ servicioId, cliente }: { servicioId: string; cliente: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(hoyLima());
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nota, setNota] = useState("");

  function enviar() {
    if (numero.trim().length < 4) return toast.error("Escriba el número de la factura (serie y número)");
    if (!fecha) return toast.error("Falta la fecha de emisión");
    if (archivo && archivo.size > 10 * 1024 * 1024) return toast.error("El archivo pasa de 10 MB");
    startTransition(async () => {
      let path: string | null = null;
      if (archivo) {
        path = `facturas/${servicioId}/${crypto.randomUUID()}-${archivo.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
        const { error } = await createClient().storage.from("adjuntos").upload(path, archivo, { contentType: archivo.type || "application/pdf" });
        if (error) return void toast.error(`No se pudo subir la factura: ${error.message}`);
      }
      const r = await registrarFactura({ servicioId, numero, fecha, path, nombre: archivo?.name ?? null, nota: nota.trim() || null });
      if (r.error) return void toast.error(r.error, { duration: 9000 });
      toast.success("Factura registrada: Finanzas y Central ya recibieron el aviso");
      setAbierto(false);
      setNumero("");
      setArchivo(null);
      setNota("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm">
            <FileCheck2 className="size-3.5" />
            Registrar factura
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar la factura</DialogTitle>
          <DialogDescription>{cliente}. Antes de registrar, revise que el expediente esté alineado.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="fac-numero">Número</Label>
              <Input id="fac-numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="F001-00012345" className="font-mono uppercase" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fac-fecha">Fecha de emisión</Label>
              <Input id="fac-fecha" type="date" value={fecha} max={hoyLima()} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>El PDF de la factura (opcional)</Label>
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
                Adjuntar el PDF: Central lo imprime para el expediente
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fac-nota">Nota (opcional)</Label>
            <Textarea id="fac-nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: crédito a 30 días; con detracción" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={pendiente}>
              {pendiente ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}
              Registrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ObservarExpediente({ servicioId, cliente }: { servicioId: string; cliente: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");

  function enviar() {
    if (motivo.trim().length < 5) return toast.error("Diga qué no está alineado en el expediente");
    startTransition(async () => {
      const r = await observarExpediente(servicioId, motivo);
      if (r.error) return void toast.error(r.error);
      toast.success("Observado: Central ya recibió el motivo");
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
            <AlertTriangle className="size-3.5" />
            Observar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>El expediente no está alineado</DialogTitle>
          <DialogDescription>{cliente}. Central recibe el motivo, corrige y levanta la observación.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Textarea
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: la orden de compra trae otro RUC que la cotización; la cotización no es la del cierre"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={enviar} disabled={pendiente}>
              {pendiente ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
              Observar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LevantarObservacion({ servicioId }: { servicioId: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pendiente}
      onClick={() =>
        startTransition(async () => {
          const r = await levantarObservacion(servicioId);
          if (r.error) return void toast.error(r.error);
          toast.success("Observación levantada: Facturación ya puede facturar");
          router.refresh();
        })
      }
    >
      {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
      Ya está corregido
    </Button>
  );
}
