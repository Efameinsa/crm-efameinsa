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
import { ListaTecnicos, ID_LISTA_TECNICOS } from "@/components/crm/lista-tecnicos";

/**
 * APERTURA DE SERVICIO DESDE UN CASO (0407). Reunión de gerencia 06-10 11:01:
 * un servicio que no viene de un pedido —la garantía de Jaén, un técnico que
 * tiene que viajar— necesita su apertura con el formato de siempre. «Derivar
 * llamada» es la orden al almacén para una videollamada; esto es la apertura
 * de servicio: va a Finanzas (autoriza la guía) y al almacén (la emite).
 *
 * También desde la cabecera de la ficha del cliente (buzón, Rubí 07-10: «no
 * solo es para despacho, también para una visita al local del cliente»): ahí
 * llega con `casos` —los abiertos del cliente sin apertura— y se elige de cuál
 * sale.
 */
/** Garantía y revisión van aparte (buzón, Rubí 07-10: «son diferentes servicios», 0418). */
type TipoServicioApertura = "garantia" | "revision" | "mantenimiento";

export type CasoParaApertura = { id: string; etiqueta: string; enGarantia: boolean; tecnico: string | null };

export function AperturaServicioCaso({
  atencionId: atencionFija,
  enGarantia: garantiaFija,
  direccionSugerida,
  tecnicoSugerido,
  casos,
}: {
  atencionId?: string;
  enGarantia?: boolean;
  direccionSugerida?: string | null;
  tecnicoSugerido?: string | null;
  casos?: CasoParaApertura[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [atencionId, setAtencionId] = useState(atencionFija ?? casos?.[0]?.id ?? "");
  const enGarantia = garantiaFija ?? casos?.find((c) => c.id === atencionId)?.enGarantia ?? false;
  const tecnicoDelCaso = tecnicoSugerido ?? casos?.find((c) => c.id === atencionId)?.tecnico;
  const [pendiente, startTransition] = useTransition();
  const [tipoPedido, setTipoPedido] = useState<TipoServicioApertura>(enGarantia ? "garantia" : "mantenimiento");
  const [formato, setFormato] = useState<"mantenimiento" | "puesta_marcha">("mantenimiento");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [tecnico, setTecnico] = useState(tecnicoDelCaso ?? "");
  const [transporte, setTransporte] = useState("");
  const [direccion, setDireccion] = useState(direccionSugerida ?? "");
  const [confirmo, setConfirmo] = useState("");
  const [recibe, setRecibe] = useState("");
  const [recibeTelefono, setRecibeTelefono] = useState("");
  const [destino, setDestino] = useState<"lima" | "provincia" | "">("");
  const [guia, setGuia] = useState("");
  const [guiaDetalle, setGuiaDetalle] = useState("");
  const [nota, setNota] = useState("");
  const [empresa, setEmpresa] = useState<"EFAMEINSA" | "OPEN">("EFAMEINSA");

  const falta = [
    !atencionId && "el caso",
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
        recibe,
        recibeTelefono,
        destino: destino as "lima" | "provincia",
        guia: guia || null,
        guiaDetalle,
        nota,
        empresa,
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
          {casos && (
            <div className="grid gap-1 sm:col-span-2">
              <Label className="text-xs">Caso del que sale la apertura <span className="text-destructive">*</span></Label>
              <select
                className={select}
                value={atencionId}
                onChange={(e) => {
                  const c = casos.find((x) => x.id === e.target.value);
                  setAtencionId(e.target.value);
                  setTipoPedido(c?.enGarantia ? "garantia" : "mantenimiento");
                  if (!tecnico.trim() && c?.tecnico) setTecnico(c.tecnico);
                }}
              >
                {casos.map((c) => (
                  <option key={c.id} value={c.id}>{c.etiqueta}</option>
                ))}
              </select>
            </div>
          )}
          {/* Rubí, 09-10: «la opción de escoger con qué empresa realizar la apertura». Sin cierre no
              hay serie de la que tomarla (0421). */}
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">Empresa con la que sale la apertura</Label>
            <select className={select} value={empresa} onChange={(e) => setEmpresa(e.target.value as "EFAMEINSA" | "OPEN")}>
              <option value="EFAMEINSA">CORPORACIÓN EFAMEINSA S.A.</option>
              <option value="OPEN">OPEN INVESTMENTS S.A.C.</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Servicio</Label>
            <select className={select} value={tipoPedido} onChange={(e) => setTipoPedido(e.target.value as TipoServicioApertura)}>
              <option value="garantia">Garantía</option>
              <option value="revision">Revisión</option>
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
            <Input value={tecnico} onChange={(e) => setTecnico(e.target.value)} placeholder="Elija de la relación de técnicos o escriba" list={ID_LISTA_TECNICOS} />
            <ListaTecnicos />
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
          {/* Rubí, 09-10: «por qué no aparece el nombre de quien recibe si coloqué el nombre». La fila
              PERSONA QUE RECIBE de la apertura salía «—»: este formulario no la pedía. Si se deja
              vacía, va quien confirmó la dirección. */}
          <div className="grid gap-1">
            <Label className="text-xs">Persona que recibe al técnico</Label>
            <Input value={recibe} onChange={(e) => setRecibe(e.target.value)} placeholder={confirmo.trim() ? `Si lo deja vacío: ${confirmo.trim()}` : "Si lo deja vacío, va quien confirmó"} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Celular de quien recibe</Label>
            <Input value={recibeTelefono} onChange={(e) => setRecibeTelefono(e.target.value)} inputMode="tel" />
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
