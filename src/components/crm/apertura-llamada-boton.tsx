"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PhoneForwarded } from "lucide-react";
import { enviarAperturaLlamada } from "@/lib/acciones/aperturas-llamada";
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
 */
export function AperturaLlamadaBoton({
  cuentaId,
  servicioId = null,
  atencionId = null,
  equipos = "",
  contacto = "",
  tipo: tipoInicial = "videollamada_preinstalacion",
  etiqueta = "Enviar apertura de llamada",
  compacto = false,
}: {
  cuentaId: string;
  servicioId?: string | null;
  atencionId?: string | null;
  equipos?: string;
  contacto?: string;
  tipo?: TipoApertura;
  etiqueta?: string;
  compacto?: boolean;
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

  function enviar() {
    startTransition(async () => {
      const r = await enviarAperturaLlamada({
        cuentaId,
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
      toast.success("Apertura enviada: el almacén ya la tiene en su bandeja");
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
            <Button size="sm">
              <PhoneForwarded className="size-3.5" />
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={pendiente || !texto.trim() || !fecha || !hora}>
            {pendiente && <Loader2 className="size-4 animate-spin" />}
            Enviar al almacén
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
