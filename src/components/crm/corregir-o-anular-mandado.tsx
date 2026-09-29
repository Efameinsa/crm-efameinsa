"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Pencil } from "lucide-react";
import { anularMiRegistro, corregirMiRegistro } from "@/lib/acciones/leads";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DetalleMandado } from "@/lib/mandado-a-central";

/**
 * «¿Se registró mal?» dentro de una fila de «Lo que mandé a Central» (0338).
 *
 * Almacén, 29-09: registró dos veces un contacto con la razón social que le
 * dio un trabajador del cliente, y la de SUNAT era otra. Tuvo que pedirle por
 * correo a Santos que lo anulara. Carlos: «el ALMACEN debe permitir anular la
 * Llamada mediante PIN». Mismo trato que «¿Serie equivocada? Corregir con
 * código»: se puede, con el código de gerencia u operaciones y el motivo, y
 * solo mientras sigue en la bandeja de Central.
 */
export function CorregirOAnularMandado({
  leadId,
  detalle,
  onListo,
}: {
  leadId: string;
  detalle: DetalleMandado;
  onListo: () => void;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<"nada" | "corregir" | "anular">("nada");
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [nombre, setNombre] = useState(detalle.contacto ?? "");
  const [razon, setRazon] = useState(detalle.razonSocial ?? "");
  const [ruc, setRuc] = useState(detalle.ruc ?? "");
  const [telefono, setTelefono] = useState(detalle.telefono ?? "");
  const [email, setEmail] = useState(detalle.email ?? "");
  const [mensaje, setMensaje] = useState(detalle.mensaje ?? "");
  const [enviando, startTransition] = useTransition();

  const listoParaEnviar = pin.replace(/\D/g, "").length === 4 && motivo.trim().length >= 5;

  function enviar() {
    startTransition(async () => {
      const r =
        modo === "anular"
          ? await anularMiRegistro(leadId, pin, motivo)
          : await corregirMiRegistro(leadId, pin, motivo, { nombre, razonSocial: razon, telefono, email, numDoc: ruc, mensaje });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(r.resumen ?? (modo === "anular" ? "Registro anulado" : "Registro corregido"));
      setModo("nada");
      onListo();
      router.refresh();
    });
  }

  if (modo === "nada") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">¿Se registró mal o dos veces?</span>
        <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => setModo("corregir")}>
          <Pencil className="size-3" /> Corregir con código
        </button>
        <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline" onClick={() => setModo("anular")}>
          <Ban className="size-3" /> Anular con código
        </button>
      </div>
    );
  }

  return (
    <div
      className={
        modo === "anular"
          ? "space-y-2.5 rounded-md border border-amber-400/50 bg-amber-500/5 p-3"
          : "space-y-2.5 rounded-md border border-primary/30 bg-primary/5 p-3"
      }
    >
      <p className="text-sm font-medium text-foreground">
        {modo === "anular" ? "Anular este registro" : "Corregir los datos"}
      </p>
      <p className="text-xs text-muted-foreground">
        {modo === "anular"
          ? "Sale de la bandeja de Central y en esta lista queda como anulado por usted, con el motivo."
          : "Central lo ve ya corregido; los datos de antes quedan guardados a la vista."}{" "}
        Pídale el código a gerencia o a operaciones.
      </p>

      {modo === "corregir" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`cm-razon-${leadId}`} className="text-xs">Razón social (como en SUNAT)</Label>
            <Input id={`cm-razon-${leadId}`} value={razon} onChange={(e) => setRazon(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`cm-ruc-${leadId}`} className="text-xs">RUC o DNI</Label>
            <Input id={`cm-ruc-${leadId}`} value={ruc} onChange={(e) => setRuc(e.target.value)} inputMode="numeric" className="h-8 font-mono text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`cm-nombre-${leadId}`} className="text-xs">Persona de contacto</Label>
            <Input id={`cm-nombre-${leadId}`} value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`cm-tel-${leadId}`} className="text-xs">Teléfono</Label>
            <Input id={`cm-tel-${leadId}`} value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" className="h-8 text-sm" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`cm-email-${leadId}`} className="text-xs">Correo</Label>
            <Input id={`cm-email-${leadId}`} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" className="h-8 text-sm" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`cm-msj-${leadId}`} className="text-xs">Lo que pide</Label>
            <Textarea id={`cm-msj-${leadId}`} value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={3} className="text-sm" />
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor={`cm-motivo-${leadId}`} className="text-xs">Por qué</Label>
        <Input
          id={`cm-motivo-${leadId}`}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={modo === "anular" ? "Ej.: se registró dos veces / la razón social era otra" : "Ej.: la encargada dio la razón social de SUNAT"}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`cm-pin-${leadId}`} className="text-xs">Código de autorización</Label>
        <CampoCodigo valor={pin} onChange={setPin} tono={modo === "anular" ? "amber" : "primary"} id={`cm-pin-${leadId}`} enmascarar />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={modo === "anular" ? "destructive" : "default"} disabled={enviando || !listoParaEnviar} onClick={enviar}>
          {modo === "anular" ? "Anular" : "Guardar la corrección"}
        </Button>
        <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setModo("nada")}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
