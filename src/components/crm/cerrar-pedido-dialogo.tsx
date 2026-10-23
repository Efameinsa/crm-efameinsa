"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { celebrar } from "@/lib/celebrar";
import { Lock, OctagonAlert } from "lucide-react";
import { cerrarPedido } from "@/lib/acciones/postventa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { fechaLima } from "@/lib/fechas";
import { cierreExigePuesta } from "@/lib/postventa";

/**
 * CERRAR EL PEDIDO (reunión de gerencia 20-10, Brenda PV2 con Beneficencia de
 * Huancayo). Antes era un cuadro con las series en un texto libre:
 *  · «tendría que jalarlo, no escribirlo» → las series del pedido se marcan;
 *    solo la que falte se escribe.
 *  · «la garantía ya está corriendo desde que hemos entregado… que permita
 *    seleccionar la fecha» → fecha de entrega editable, propuesta desde la
 *    puesta en marcha o el despacho, y dice de dónde salió.
 *  · «no debería dejar cerrar si no está el informe ejecutado… con PIN» → sin
 *    puesta en marcha pide el código de gerencia u operaciones y el motivo, a
 *    la vista, antes de apretar (0551).
 */
export function CerrarPedidoDialogo({
  abierto,
  cerrar,
  servicio,
  equiposLista,
}: {
  abierto: boolean;
  cerrar: () => void;
  servicio: {
    id: string;
    puesta_en_marcha: string | null;
    despachado_at: string | null;
    fecha_despacho: string | null;
    tipo_pedido?: string | null;
    con_instalacion?: boolean | null;
    origen?: string | null;
  };
  equiposLista: { equipoId: string | null; serie: string | null; descripcion: string }[];
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [fallo, setFallo] = useState<string | null>(null);

  const conSerie = useMemo(
    () => equiposLista.filter((e) => e.serie?.trim()).map((e) => ({ serie: e.serie!.trim().toUpperCase(), descripcion: e.descripcion })),
    [equiposLista],
  );
  const sinSerie = equiposLista.filter((e) => !e.serie?.trim()).length;

  // La fecha propuesta y de dónde sale: lo primero que pregunta gerencia.
  const propuesta = useMemo(() => {
    if (servicio.puesta_en_marcha) return { fecha: servicio.puesta_en_marcha.slice(0, 10), origen: "la puesta en marcha" };
    if (servicio.despachado_at) return { fecha: fechaISOLima(servicio.despachado_at), origen: "la salida del almacén" };
    if (servicio.fecha_despacho) return { fecha: servicio.fecha_despacho.slice(0, 10), origen: "la fecha de despacho programada" };
    return { fecha: fechaISOLima(new Date().toISOString()), origen: "hoy (no hay fecha de entrega registrada)" };
  }, [servicio]);

  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(conSerie.map((e) => e.serie)));
  const [extra, setExtra] = useState("");
  const [fecha, setFecha] = useState(propuesta.fecha);
  const [garantia, setGarantia] = useState("24");
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState("");

  const llevaPuesta = cierreExigePuesta(servicio);
  const faltaPuesta = llevaPuesta && !servicio.puesta_en_marcha;
  const falta = faltaPuesta
    ? motivo.trim().length < 5
      ? "Escriba por qué se cierra sin puesta en marcha (por ejemplo: provincia, el cliente no pidió la visita)."
      : pin.length < 4
        ? "Falta el código de 4 dígitos de gerencia u operaciones."
        : null
    : null;

  function enviar() {
    if (falta) {
      setFallo(falta);
      return;
    }
    const series = [...marcadas, ...extra.split(/[,;\n]/)].map((x) => x.trim()).filter(Boolean);
    setFallo(null);
    empezar(async () => {
      const r = await cerrarPedido(servicio.id, {
        series,
        garantiaMeses: Number(garantia) || 24,
        fechaEntrega: fecha || null,
        pin: faltaPuesta ? pin : null,
        motivoSinPuesta: faltaPuesta ? motivo : null,
      });
      if (r.error) {
        setFallo(r.error);
        return;
      }
      toast.success(series.length ? "Pedido cerrado. Las máquinas ya están en el registro con su garantía." : "Pedido cerrado.");
      celebrar("cierre");
      cerrar();
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cerrar el pedido</DialogTitle>
          <DialogDescription>
            Cada serie marcada entra al registro de máquinas con su garantía y su primer mantenimiento agendado. El cierre queda en el historial del cliente con su nombre.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Equipos entregados</Label>
            {conSerie.length ? (
              <ul className="grid gap-1 rounded-md border border-border p-2">
                {conSerie.map((e) => (
                  <li key={e.serie}>
                    <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4"
                        checked={marcadas.has(e.serie)}
                        onChange={(ev) =>
                          setMarcadas((m) => {
                            const n = new Set(m);
                            if (ev.target.checked) n.add(e.serie);
                            else n.delete(e.serie);
                            return n;
                          })
                        }
                      />
                      <span>
                        <b className="font-mono">{e.serie}</b> · {e.descripcion}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                El almacén no registró series en este pedido. Si las tiene a mano (la placa), escríbalas abajo; si no, pídaselas al almacén antes de cerrar: sin serie la máquina no entra al registro ni tiene garantía calculada.
              </p>
            )}
            {(sinSerie > 0 || conSerie.length === 0) && (
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                  {sinSerie > 0 ? `${sinSerie} equipo(s) del pedido sin serie todavía. ` : ""}Solo si falta alguna, escríbala como se lee en la placa (varias, con coma):
                </span>
                <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Serie de la placa" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="cierre-fecha">Entregado el (desde aquí corre la garantía)</Label>
              <Input id="cierre-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              <span className="text-[11px] text-muted-foreground">
                Propuesta: {fechaLima(propuesta.fecha + "T12:00:00")}, de {propuesta.origen}.
              </span>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="cierre-garantia">Meses de garantía</Label>
              <Input id="cierre-garantia" type="number" min={0} value={garantia} onChange={(e) => setGarantia(e.target.value)} />
            </div>
          </div>

          {faltaPuesta && (
            <div className="grid gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
              <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                <Lock className="mt-0.5 size-4 shrink-0" />
                <span>
                  Este pedido no tiene la puesta en marcha (ni el informe del servicio). Lo normal es llenarlo primero con «Llenar informe». Si de verdad no aplica —provincia, el cliente no pidió la visita—, se cierra con el código de gerencia u operaciones y el motivo.
                </span>
              </p>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se cierra sin puesta en marcha" rows={2} />
              <CampoCodigo id="cierre-pin" tono="amber" valor={pin} onChange={setPin} />
            </div>
          )}

          {fallo && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
              <OctagonAlert className="mt-0.5 size-4 shrink-0" /> {fallo}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={cerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={pendiente || !!falta} porQue={falta}>
              {pendiente ? "Cerrando…" : "Cerrar el pedido"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function fechaISOLima(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}
