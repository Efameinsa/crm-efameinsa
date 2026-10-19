"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, Clock, HandCoins, Loader2, Paperclip, Receipt, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { consultarPagoAFinanzas, responderConsultaPago } from "@/lib/acciones/finanzas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fechaHoraLima } from "@/lib/fechas";

/**
 * LAS CONSULTAS DEL PAGO ENTRE EL COMERCIAL Y FINANZAS (0520; Katerine, 16-10).
 *
 * Antes era un correo a Contabilidad con el voucher: «¿hubo comisión
 * interplaza?» y, al final, «el cliente ya canceló». Ahora el comercial lo
 * pide desde «Pagos» del pedido, con el voucher, y Finanzas contesta en el
 * mismo pedido (si hubo comisión, con el monto y el pantallazo que el
 * comercial le reenvía al cliente). Confirmar u observar el abono también
 * contesta la consulta.
 */

export interface ConsultaPago {
  id: string;
  tipo: "comision" | "cancelo";
  nota: string | null;
  createdAt: string;
  creadoPorNombre: string | null;
  /** El primero y los demás (0535: el cliente pagó en varios depósitos). */
  voucherUrls: string[];
  respondidaAt: string | null;
  respondidaPorNombre: string | null;
  respuesta: string | null;
  /** Ya con la moneda: «S/ 12.00». */
  comision: string | null;
  respuestaAdjuntoUrl: string | null;
}

const TITULO: Record<ConsultaPago["tipo"], string> = {
  comision: "¿Hubo comisión interplaza o bancaria?",
  cancelo: "El cliente canceló",
};

async function subir(prefijo: "pagos-comercial" | "finanzas", servicioId: string, f: File): Promise<string> {
  if (f.size > 10 * 1024 * 1024) throw new Error("El archivo pasa de 10 MB");
  const path = `${prefijo}/${servicioId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(0, 60)}`;
  const { error } = await createClient().storage.from("adjuntos").upload(path, f, { contentType: f.type || "application/octet-stream" });
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  return path;
}

function CampoArchivo({ etiqueta, archivo, onChange }: { etiqueta: string; archivo: File | null; onChange: (f: File | null) => void }) {
  return archivo ? (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
      <span className="truncate">{archivo.name}</span>
      <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground" aria-label="Quitar el archivo">
        <X className="size-4" />
      </button>
    </div>
  ) : (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent">
      <Paperclip className="size-4" />
      {etiqueta}
      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </label>
  );
}

const MAX_VOUCHERS = 10;

/** Uno o varios vouchers (0535): el cliente a veces paga en dos o tres depósitos. */
function CampoVouchers({ archivos, onChange }: { archivos: File[]; onChange: (f: File[]) => void }) {
  return (
    <div className="grid gap-1.5">
      {archivos.map((a, i) => (
        <div key={`${a.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
          <span className="truncate">{a.name}</span>
          <button type="button" onClick={() => onChange(archivos.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground" aria-label={`Quitar ${a.name}`}>
            <X className="size-4" />
          </button>
        </div>
      ))}
      {archivos.length < MAX_VOUCHERS && (
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent">
          <Paperclip className="size-4" />
          {archivos.length ? "Agregar otro voucher" : "Adjuntar el voucher del cliente (imagen o PDF; puede elegir varios)"}
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              onChange([...archivos, ...Array.from(e.target.files ?? [])].slice(0, MAX_VOUCHERS));
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

/** Los dos botones del comercial en «Pagos» del pedido. */
export function ConsultarPagoBotones({ servicioId }: { servicioId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <DialogoConsulta servicioId={servicioId} tipo="comision" />
      <DialogoConsulta servicioId={servicioId} tipo="cancelo" />
    </div>
  );
}

function DialogoConsulta({ servicioId, tipo }: { servicioId: string; tipo: ConsultaPago["tipo"] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [vouchers, setVouchers] = useState<File[]>([]);
  const [nota, setNota] = useState("");
  const [problema, setProblema] = useState<string | null>(null);

  function enviar() {
    setProblema(null);
    if (!vouchers.length) return setProblema("Adjunte el voucher que le mandó el cliente.");
    startTransition(async () => {
      let rutas: string[];
      try {
        rutas = await Promise.all(vouchers.map((v) => subir("pagos-comercial", servicioId, v)));
      } catch (e) {
        setProblema(e instanceof Error ? e.message : "No se pudo subir el voucher. Vuelva a intentarlo.");
        return;
      }
      const [voucherPath, ...vouchersExtra] = rutas;
      const r = await consultarPagoAFinanzas({ servicioId, tipo, voucherPath, vouchersExtra, nota });
      if (r.error) return setProblema(r.error);
      toast.success("Enviado a Finanzas. Su respuesta le llega a la campana y queda aquí.");
      setAbierto(false);
      setVouchers([]);
      setNota("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm" variant={tipo === "cancelo" ? "default" : "outline"}>
            {tipo === "comision" ? <HandCoins className="size-4" /> : <Receipt className="size-4" />}
            {tipo === "comision" ? "Preguntar si hubo comisión" : "Avisar que el cliente canceló"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITULO[tipo]}</DialogTitle>
          <DialogDescription>
            {tipo === "comision"
              ? "Finanzas revisa en el banco si el abono llegó completo. Si hubo comisión interplaza o bancaria, le contesta con el monto y el pantallazo para que se lo envíe al cliente."
              : "Finanzas ubica el abono en el banco y lo confirma. Mientras el cliente no termine de pagar, la operación sigue abierta."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <CampoVouchers archivos={vouchers} onChange={setVouchers} />
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder={tipo === "comision" ? "Opcional: monto o fecha del voucher, banco" : "Opcional: «canceló el saldo del 50 %», monto, banco"}
          />
          {problema && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-snug text-destructive">{problema}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button size="sm" onClick={enviar} disabled={pendiente}>
              {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Enviar a Finanzas
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** La lista de consultas; con `responder`, Finanzas contesta las abiertas. */
export function ListaConsultasPago({ consultas, servicioId, responder = false }: { consultas: ConsultaPago[]; servicioId: string; responder?: boolean }) {
  if (!consultas.length) return null;
  return (
    <ul className="divide-y divide-border">
      {consultas.map((c) => (
        <li key={c.id} className="space-y-1 px-4 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-1.5 font-semibold text-foreground">
            {c.respondidaAt ? <BadgeCheck className="size-4 text-[#1E7F4F]" /> : <Clock className="size-4 text-amber-600" />}
            {TITULO[c.tipo]}
            <span className="font-normal text-muted-foreground">
              · {c.creadoPorNombre ?? "Comercial"} · {fechaHoraLima(c.createdAt)}
            </span>
            {c.voucherUrls.map((u, i) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Paperclip className="size-3.5" /> {c.voucherUrls.length > 1 ? `Voucher ${i + 1}` : "Ver el voucher"}
              </a>
            ))}
          </p>
          {c.nota && <p className="text-xs text-muted-foreground">{c.nota}</p>}
          {c.respondidaAt ? (
            <div className="rounded-md bg-secondary/60 px-2.5 py-1.5 text-xs text-foreground">
              <b>Finanzas</b>
              {c.respondidaPorNombre ? ` (${c.respondidaPorNombre})` : ""}, {fechaHoraLima(c.respondidaAt)}:{" "}
              {c.comision && <b className="text-amber-800">Comisión de {c.comision}. </b>}
              {c.respuesta}
              {c.respuestaAdjuntoUrl && (
                <>
                  {" "}
                  <a href={c.respuestaAdjuntoUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                    Ver el pantallazo
                  </a>
                </>
              )}
            </div>
          ) : responder ? (
            <ResponderConsulta servicioId={servicioId} consulta={c} />
          ) : (
            <p className="text-xs text-amber-800">Esperando la respuesta de Finanzas.</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function ResponderConsulta({ servicioId, consulta }: { servicioId: string; consulta: ConsultaPago }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [huboComision, setHuboComision] = useState<boolean | null>(consulta.tipo === "comision" ? null : false);
  const [monto, setMonto] = useState("");
  const [pantallazo, setPantallazo] = useState<File | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [problema, setProblema] = useState<string | null>(null);

  function enviar() {
    setProblema(null);
    if (consulta.tipo === "comision" && huboComision === null) return setProblema("Marque si hubo comisión o no.");
    const comision = huboComision ? Number(monto.replace(",", ".")) : null;
    if (huboComision && !(comision && comision > 0)) return setProblema("Escriba el monto de la comisión.");
    const texto = respuesta.trim() || (huboComision ? "El banco descontó esa comisión." : consulta.tipo === "comision" ? "No hubo comisión: el abono llegó completo." : "Recibido.");
    startTransition(async () => {
      let adjuntoPath: string | null = null;
      try {
        if (pantallazo) adjuntoPath = await subir("finanzas", servicioId, pantallazo);
      } catch (e) {
        setProblema(e instanceof Error ? e.message : "No se pudo subir el pantallazo.");
        return;
      }
      const r = await responderConsultaPago({ servicioId, consultaId: consulta.id, respuesta: texto, comision, adjuntoPath });
      if (r.error) return setProblema(r.error);
      toast.success("Respondido: al comercial le llegó el aviso.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2 rounded-md border border-amber-300 bg-amber-50/60 p-2.5">
      {consulta.tipo === "cancelo" && (
        <p className="text-xs text-amber-900">Si el abono ya está en el banco, use «Confirmar abono» arriba: eso también contesta esta consulta.</p>
      )}
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="inline-flex items-center gap-1.5">
          <input type="radio" checked={huboComision === false} onChange={() => setHuboComision(false)} />
          {consulta.tipo === "comision" ? "No hubo comisión" : "Sin comisión"}
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="radio" checked={huboComision === true} onChange={() => setHuboComision(true)} />
          Hubo comisión
        </label>
      </div>
      {huboComision && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs">Monto de la comisión</Label>
            <Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Pantallazo del banco (para el cliente)</Label>
            <CampoArchivo etiqueta="Adjuntar" archivo={pantallazo} onChange={setPantallazo} />
          </div>
        </div>
      )}
      <Textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={2} placeholder="Opcional: lo que quiera decirle al comercial" />
      {problema && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{problema}</p>}
      <div className="flex justify-end">
        <Button size="sm" onClick={enviar} disabled={pendiente}>
          {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Responder al comercial
        </Button>
      </div>
    </div>
  );
}
