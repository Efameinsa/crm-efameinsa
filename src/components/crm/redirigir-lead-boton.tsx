"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, UserCheck } from "lucide-react";
import { redirigirLead } from "@/lib/acciones/leads";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Corregir a quién se derivó un contacto.
 *
 * Pedido de Central el 25-08: «hubo un error al asignar». El botón vive en la
 * lista de lo que derivó, al lado del contacto, porque es ahí donde se da
 * cuenta del error.
 *
 * Lo que NO hace es decidir si se puede: eso lo resuelve la base (migración
 * 0079) y si se niega, devuelve el motivo en palabras —«ya cotizó», «ya
 * registró gestiones», «al cliente ya se le vendió»— que es lo que Central
 * necesita para saber si le toca pedirlo a gerencia.
 */
export function RedirigirLeadBoton({
  leadId,
  contacto,
  comercialActual,
  comerciales,
  supervisores = [],
}: {
  leadId: string;
  contacto: string;
  comercialActual: string | null;
  comerciales: { id: string; nombre: string; codigo_comercial: string | null }[];
  /** A quién llamar por el código. Sin esto, el campo del PIN es un callejón. */
  supervisores?: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [enviando, startTransition] = useTransition();

  const opciones = comerciales.filter((c) => c.id !== comercialActual);
  const listo = Boolean(destino) && motivo.trim().length >= 10 && pin.length === 4;

  function guardar() {
    if (!listo) return;
    startTransition(async () => {
      const r = await redirigirLead(leadId, destino, pin, motivo);
      if (r.error) {
        // Los avisos de la base son largos a propósito (explican por qué no se
        // puede y qué hacer), así que se muestran completos.
        toast.error(r.error, { duration: 9000 });
        // El código se quema al usarse: si algo falló después de validarlo, el
        // que está en pantalla ya no sirve y hay que pedir otro.
        setPin("");
        return;
      }
      toast.success("Contacto reasignado");
      setAbierto(false);
      setDestino("");
      setMotivo("");
      setPin("");
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
            <ArrowRightLeft className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Corregir la derivación</DialogTitle>
          <DialogDescription>
            <b>{contacto}</b> pasa al comercial que corresponda. Solo se puede si el actual todavía no lo trabajó: si
            ya cotizó o registró gestiones, el traspaso lo autoriza gerencia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="destino">Derivar ahora a</Label>
          <select
            id="destino"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Elegir comercial…</option>
            {opciones.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo_comercial ? `${c.codigo_comercial} · ` : ""}
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* El motivo NO es burocracia: es lo único que después va a explicar
            por qué se derivó mal. El PIN evita que la corrección pase en
            silencio; esto es lo que se lee cuando se quiere entender. */}
        <div className="space-y-1.5">
          <Label htmlFor="motivo">¿Por qué hay que corregirlo?</Label>
          <Textarea
            id="motivo"
            rows={2}
            placeholder="ej.: lo derivé a comercial por la coincidencia de cliente, pero pedía mantenimiento"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        {/* La caja de Plaza Vea, tal cual lo pidió el ing. Carlos el 27-08: la
            corrección la habilita un supervisor, no quien se equivocó. */}
        <div className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <Label htmlFor="pin">Código del supervisor</Label>
          <div className="flex items-start gap-3">
            <input
              id="pin"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="0000"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="h-11 w-28 flex-none rounded-md border border-input bg-background text-center font-mono text-xl tracking-[0.3em]"
            />
            {/* CON NOMBRE Y APELLIDO. Pedir «el código del supervisor» sin decir
                de quién dejaba a Central sin saber a quién llamar, y el control
                se vuelve un callejón (corregido el 27-08, el mismo día). */}
            <div className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
              {supervisores.length > 0 ? (
                <>
                  <span className="flex items-center gap-1 font-semibold text-foreground">
                    <UserCheck className="size-3.5 flex-none" />
                    Pídaselo a cualquiera de ellos:
                  </span>
                  <ul className="mt-0.5">
                    {supervisores.map((s) => (
                      <li key={s.id}>· {s.nombre}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <span>Pídaselo a gerencia.</span>
              )}
            </div>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Lo tiene en su barra lateral, en <b>«PIN de autorización»</b>. Cambia cada dos minutos y sirve para{" "}
            <b>una sola</b> corrección.
          </p>
        </div>

        <DialogFooter>
          <Button disabled={enviando || !listo} onClick={guardar}>
            Reasignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
