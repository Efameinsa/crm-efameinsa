"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { abrirAperturaDesdeCaso } from "@/lib/acciones/postventa";
import { GUIAS_APERTURA } from "@/lib/apertura-servicio";

/**
 * APERTURA DE SERVICIO DESDE UN CASO (0407). Reunión de gerencia 06-10 11:01:
 * un servicio que no viene de un pedido —la garantía de Jaén, un técnico que
 * tiene que viajar— necesita su apertura con el formato de siempre. «Derivar
 * llamada» es la orden al almacén para una videollamada; esto es la apertura
 * de servicio: va a Finanzas (autoriza la guía) y al almacén (la emite).
 */
export function AperturaServicioCaso({
  atencionId,
  enGarantia,
  direccionSugerida,
  tecnicoSugerido,
}: {
  atencionId: string;
  enGarantia: boolean;
  direccionSugerida?: string | null;
  tecnicoSugerido?: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [tipoPedido, setTipoPedido] = useState<"mantenimiento" | "revision">(enGarantia ? "revision" : "mantenimiento");
  const [formato, setFormato] = useState<"mantenimiento" | "puesta_marcha">("mantenimiento");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [tecnico, setTecnico] = useState(tecnicoSugerido ?? "");
  const [transporte, setTransporte] = useState("");
  const [direccion, setDireccion] = useState(direccionSugerida ?? "");
  const [confirmo, setConfirmo] = useState("");
  const [destino, setDestino] = useState<"lima" | "provincia" | "">("");
  const [guia, setGuia] = useState("");
  const [guiaDetalle, setGuiaDetalle] = useState("");
  const [nota, setNota] = useState("");

  const falta = [
    !fecha && "el día",
    !tecnico.trim() && "el técnico",
    !direccion.trim() && "dónde se hace",
    !confirmo.trim() && "con quién lo confirmó",
    !destino && "Lima o provincia",
  ].filter(Boolean) as string[];

  const emitir = () =>
    startTransition(async () => {
      const r = await abrirAperturaDesdeCaso(atencionId, {
        tipoPedido,
        formato,
        fecha,
        hora,
        tecnico,
        transporte,
        direccion,
        confirmo,
        destino: destino as "lima" | "provincia",
        guia: guia || null,
        guiaDetalle,
        nota,
      });
      if (r.error) return void toast.error(r.error, { duration: 9000 });
      toast.success("Apertura emitida: le llegó a Finanzas y al almacén");
      setAbierto(false);
      if (r.servicioId) router.push(`/postventa/pedidos/${r.servicioId}`);
      else router.refresh();
    });

  const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
            title="El técnico va al local del cliente: apertura con su guía, como la de un pedido"
          >
            <ClipboardList className="size-3.5" />
            Apertura de servicio
          </button>
        }
      />
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apertura de servicio</DialogTitle>
          <DialogDescription>
            Para un servicio que no viene de un pedido (una garantía, una revisión en el local del cliente). Le llega a Finanzas para autorizar la guía y al almacén para emitirla.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs">Servicio</Label>
            <select className={select} value={tipoPedido} onChange={(e) => setTipoPedido(e.target.value as "mantenimiento" | "revision")}>
              <option value="revision">Revisión / garantía</option>
              <option value="mantenimiento">Mantenimiento</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Formato de la apertura</Label>
            <select className={select} value={formato} onChange={(e) => setFormato(e.target.value as "mantenimiento" | "puesta_marcha")}>
              <option value="mantenimiento">Servicio técnico / mantenimiento</option>
              <option value="puesta_marcha">Puesta en marcha</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Día <span className="text-destructive">*</span></Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Hora</Label>
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Técnico que va <span className="text-destructive">*</span></Label>
            <Input value={tecnico} onChange={(e) => setTecnico(e.target.value)} placeholder="Ej.: DANNY SOLIS" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Transporte</Label>
            <Input value={transporte} onChange={(e) => setTransporte(e.target.value)} placeholder="Ej.: TRANSPORTE CONTRATADO, bus a Jaén" />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">Dónde se hace el servicio, tal como lo confirmó el cliente <span className="text-destructive">*</span></Label>
            <Textarea rows={2} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Con quién lo confirmó (nombre y cargo) <span className="text-destructive">*</span></Label>
            <Input value={confirmo} onChange={(e) => setConfirmo(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Lima o provincia <span className="text-destructive">*</span></Label>
            <select className={select} value={destino} onChange={(e) => setDestino(e.target.value as "lima" | "provincia" | "")}>
              <option value="">Elija…</option>
              <option value="lima">Lima</option>
              <option value="provincia">Provincia</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Guía que se pide al almacén</Label>
            <select className={select} value={guia} onChange={(e) => setGuia(e.target.value)}>
              <option value="">Ninguna</option>
              {GUIAS_APERTURA.map((g) => (
                <option key={g.clave} value={g.clave}>{g.etiqueta}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Detalle de la guía</Label>
            <Input value={guiaDetalle} onChange={(e) => setGuiaDetalle(e.target.value)} placeholder="Ej.: herramientas, manómetro, quemador" disabled={!guia} />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">Nota para el técnico y el almacén</Label>
            <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué hay que hacer, con quién coordinar al llegar" />
          </div>
        </div>
        <DialogFooter className="sm:items-center">
          {falta.length > 0 && (
            <p className="text-xs text-destructive sm:mr-auto">
              Para emitir falta: <b>{falta.join(", ")}</b>.
            </p>
          )}
          <Button variant="ghost" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={emitir} disabled={pendiente || falta.length > 0}>
            {pendiente && <Loader2 className="size-4 animate-spin" />}
            Emitir la apertura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
