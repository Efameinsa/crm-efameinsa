"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wrench } from "lucide-react";
import { avisarClientePideServicio, type TipoServicio } from "@/lib/acciones/servicio-en-vez-de-equipos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * «Este cliente no quiere equipos: quiere servicio».
 *
 * DE DÓNDE SALE (29-08). Brenda llamó a un prospecto que había entrado por
 * Google Ads pidiendo equipos y anotó en su gestión: «no desea equipos, no
 * tiene presupuesto ni para semi industrial, desea mmto, repuestos, se le
 * indicó que se va a derivar con postventa». Central quiso mandarlo a Post
 * Venta y no pudo: el cliente ya tenía gestiones y una compra vieja, así que
 * la base —con razón— le dijo que eso ya no era corregir una derivación sino
 * traspasar cartera. La única salida era volver a tipear el contacto entero.
 *
 * Este botón es el camino que faltaba: lo aprieta quien se enteró, y el aviso
 * llega a quien puede derivar.
 *
 * LO QUE NO HACE, a propósito:
 *   · NO deriva. Central sigue decidiendo (regla del ing. Carlos, 24-08); esto
 *     le deja el contacto en la bandeja con todo puesto.
 *   · NO le quita el cliente al comercial. Postventa atiende CASOS, no
 *     carteras (migración 0080), así que se crea un contacto nuevo para el
 *     mismo cliente y la oportunidad de acá se queda donde está.
 *   · NO cierra esta oportunidad. Si además no va a comprar equipos, eso se
 *     dice con la etapa, que es donde se dice siempre.
 */

const TIPOS: [TipoServicio, string, string][] = [
  ["mantenimiento", "Mantenimiento", "preventivo o correctivo"],
  ["repuesto", "Repuestos", "piezas para un equipo suyo"],
  ["garantia", "Garantía", "un equipo que compró falla"],
];

export function PideServicioBoton({ oportunidadId }: { oportunidadId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoServicio | "">("");
  const [nota, setNota] = useState("");
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  function enviar() {
    if (!tipo) return;
    empezar(async () => {
      const r = await avisarClientePideServicio({ oportunidadId, tipo, nota });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.repetido
          ? `Ya había un aviso sin derivar para este cliente (${r.codigo}). Central lo tiene en su bandeja.`
          : `Avisado como ${r.codigo}. Central lo va a derivar a Post Venta.`,
      );
      setAbierto(false);
      setTipo("");
      setNota("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Wrench className="size-3.5" />
            Pide servicio, no equipos
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Este cliente pide servicio, no equipos</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm leading-snug text-muted-foreground">
            Se lo avisa a Central con los datos del cliente ya puestos, para que lo derive a Post Venta.{" "}
            <b className="text-foreground">El cliente sigue siendo suyo</b>: postventa recibe el caso, no la cartera.
          </p>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              ¿Qué le pidió?
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {TIPOS.map(([valor, titulo, pie]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setTipo(valor)}
                  className={cn(
                    "rounded-lg border p-2.5 text-left transition-colors",
                    tipo === valor
                      ? "border-primary bg-primary/5 ring-2 ring-primary/15"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <span className="block text-sm font-semibold text-foreground">{titulo}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">{pie}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Qué le dijo el cliente
            </span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              placeholder="Ej.: no tiene presupuesto ni para semi industrial; quiere mantenimiento de las dos lavadoras que ya tiene y cotización de repuestos."
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
            <span className="text-[11px] text-muted-foreground">
              Es lo único que van a leer Central y postventa. Escríbalo como se lo contaría por teléfono.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAbierto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando || !tipo || nota.trim().length < 15}>
            {enviando ? "Avisando…" : "Avisar a Central"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
