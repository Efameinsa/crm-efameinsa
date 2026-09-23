"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PhoneForwarded, Siren } from "lucide-react";
import { enviarAperturaLlamada } from "@/lib/acciones/aperturas-llamada";
import { buscarEmpresaParaVisita } from "@/lib/acciones/visitas-planta";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { ETIQUETA_TIPO_APERTURA, TIPOS_APERTURA, type TipoApertura } from "@/lib/aperturas-llamada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * «ENVIAR APERTURA» (0281, reunión 23-09).
 *
 * Lo que postventa mandaba por correo al almacén, hecho acá: el tipo de
 * llamada o de atención, los equipos (con su serie si la tiene), el día y la
 * hora que se le dio al cliente y lo que hay que revisar. Sale desde el pedido
 * y también desde la ficha del cliente, para el cliente de hace años que no
 * tiene pedido (Rubí: «la apertura solo se realiza en los pedidos»).
 *
 * LA APERTURA URGENTE (0295; Carlos, 23-09 17:24). El cliente pide que vaya el
 * técnico ya y promete comprar: «no hay cotización, no hay cierre, no hay
 * nada… permíteme hacer mi apertura de manera directa… para poder guardar,
 * pide el PIN». Sin pedido, marcada urgente y con el código de gerencia; al
 * almacén le llega como URGENTE. Sin `cuentaId`, el diálogo pide el cliente.
 */
export function AperturaLlamadaBoton({
  cuentaId: cuentaFija = null,
  servicioId = null,
  atencionId = null,
  equipos = "",
  contacto = "",
  tipo: tipoInicial = "videollamada_preinstalacion",
  etiqueta = "Enviar apertura de llamada",
  compacto = false,
  urgenteInicial = false,
}: {
  cuentaId?: string | null;
  servicioId?: string | null;
  atencionId?: string | null;
  equipos?: string;
  contacto?: string;
  tipo?: TipoApertura;
  etiqueta?: string;
  compacto?: boolean;
  /** Abre ya marcada como urgente (el botón de «Aperturas al almacén»). */
  urgenteInicial?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const manana = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [tipo, setTipo] = useState<TipoApertura>(tipoInicial);
  const [fecha, setFecha] = useState(manana);
  const [hora, setHora] = useState("10:00");
  const [texto, setTexto] = useState(equipos);
  const [indicaciones, setIndicaciones] = useState("");
  const [persona, setPersona] = useState(contacto);
  const [urgente, setUrgente] = useState(urgenteInicial);
  const [pin, setPin] = useState("");
  const [cuenta, setCuenta] = useState<{ id: string; nombre: string } | null>(null);
  const [busca, setBusca] = useState("");
  const [opciones, setOpciones] = useState<{ id: string; razon_social: string; num_doc: string | null }[]>([]);
  const cuentaId = cuentaFija ?? cuenta?.id ?? null;
  const puedeUrgente = !servicioId;

  useEffect(() => {
    if (cuentaFija || busca.trim().length < 3) return;
    const t = setTimeout(() => buscarEmpresaParaVisita(busca).then(setOpciones), 250);
    return () => clearTimeout(t);
  }, [busca, cuentaFija]);

  function enviar() {
    if (!cuentaId) return void toast.error("Elija el cliente");
    if (urgente && pin.replace(/\D/g, "").length < 4) return void toast.error("La apertura urgente pide el código de gerencia");
    startTransition(async () => {
      const r = await enviarAperturaLlamada({
        cuentaId,
        pinUrgente: urgente ? pin : null,
        servicioId,
        atencionId,
        tipo,
        // La hora que se le dio al cliente es hora de Lima.
        programadaPara: new Date(`${fecha}T${hora || "10:00"}:00-05:00`).toISOString(),
        equipos: texto,
        indicaciones,
        contacto: persona,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(urgente ? "Apertura URGENTE enviada: el almacén ya la tiene" : "Apertura enviada: el almacén ya la tiene en su bandeja");
      setPin("");
      setAbierto(false);
      if (r.id) router.push(`/aperturas/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          compacto ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
              title="La orden al almacén para una videollamada o una atención"
            >
              <PhoneForwarded className="size-3.5" />
              {etiqueta}
            </button>
          ) : (
            <Button size="sm" variant={urgenteInicial ? "destructive" : "default"}>
              {urgenteInicial ? <Siren className="size-3.5" /> : <PhoneForwarded className="size-3.5" />}
              {etiqueta}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apertura para el almacén</DialogTitle>
          <DialogDescription>
            El almacén la recibe en su bandeja, le da el check cuando la toma y sube su informe. Usted lo revisa antes de que llegue al cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {!cuentaFija && (
            <div className="grid gap-1">
              <Label className="text-xs">
                Cliente <span className="text-destructive">*</span>
              </Label>
              {cuenta ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                  <span className="truncate">{cuenta.nombre}</span>
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => setCuenta(null)}>
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Razón social o RUC (3 letras o más)" autoFocus />
                  {busca.trim().length >= 3 && opciones.length > 0 && (
                    <ul className="max-h-40 overflow-auto rounded-md border border-border text-sm">
                      {opciones.map((o) => (
                        <li key={o.id}>
                          <button
                            type="button"
                            className="w-full px-2.5 py-1.5 text-left hover:bg-accent"
                            onClick={() => {
                              setCuenta({ id: o.id, nombre: o.razon_social });
                              setBusca("");
                            }}
                          >
                            {o.razon_social}
                            {o.num_doc && <span className="ml-1 text-xs text-muted-foreground">{o.num_doc}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
          <div className="grid gap-1">
            <Label className="text-xs">Qué se pide</Label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoApertura)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {TIPOS_APERTURA.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_APERTURA[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">
                Día <span className="text-destructive">*</span>
              </Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">
                Hora que se le dio al cliente <span className="text-destructive">*</span>
              </Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">
              Equipos <span className="text-destructive">*</span>
            </Label>
            <Textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Uno por línea, con su serie si la tiene" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Qué hay que revisar</Label>
            <Textarea
              rows={3}
              value={indicaciones}
              onChange={(e) => setIndicaciones(e.target.value)}
              placeholder="Ej.: verificar punto de gas, desagüe, conexión eléctrica y medidas del área"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Con quién se habla (nombre y celular)</Label>
            <Input value={persona} onChange={(e) => setPersona(e.target.value)} />
          </div>
          {puedeUrgente && (
            <div className={urgente ? "grid gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5" : "grid gap-2"}>
              <label className="inline-flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
                <span>
                  <b>Urgente, sin cotización ni cierre.</b>{" "}
                  <span className="text-xs text-muted-foreground">El cliente pide atención ya. Se guarda con el código de gerencia y al almacén le llega como URGENTE.</span>
                </span>
              </label>
              {urgente && <CampoCodigo valor={pin} onChange={setPin} id="pin-apertura-urgente" />}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={pendiente || !cuentaId || !texto.trim() || !fecha || !hora || (urgente && pin.replace(/\D/g, "").length < 4)}>
            {pendiente && <Loader2 className="size-4 animate-spin" />}
            Enviar al almacén
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
