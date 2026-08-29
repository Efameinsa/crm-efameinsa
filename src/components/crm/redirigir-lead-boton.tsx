"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, UserCheck } from "lucide-react";
import { redirigirLead } from "@/lib/acciones/leads";
import { permisoSinPin } from "@/lib/acciones/seguridad";
import { faltasParaReasignar, puedeReasignar } from "@/lib/faltas-reasignacion";
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
  esPrueba = false,
  supervisores = [],
}: {
  leadId: string;
  contacto: string;
  comercialActual: string | null;
  comerciales: { id: string; nombre: string; codigo_comercial: string | null; es_prueba?: boolean }[];
  /** El contacto es del banco de pruebas: ahí sí se ofrece el comercial C0. */
  esPrueba?: boolean;
  /** A quién llamar por el código. Sin esto, el campo del PIN es un callejón. */
  supervisores?: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  // Gerencia puede levantar el código por un rato (migración 0111). Se pregunta
  // al abrir: si el servidor no lo va a mirar, la pantalla no puede exigirlo.
  const [sinPinHasta, setSinPinHasta] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  // Los perfiles de práctica (C0) solo se ofrecen cuando lo que se corrige es
  // un contacto de práctica: en una derivación real serían una trampa.
  const opciones = comerciales.filter((c) => c.id !== comercialActual && (esPrueba || !c.es_prueba));
  const sinPin = sinPinHasta !== null;
  // Qué falta y si ya se puede: la regla vive en @/lib/faltas-reasignacion,
  // que es donde se prueba.
  const estado = { destinos: opciones.length, destino, motivo, pin, sinPin };
  const falta = faltasParaReasignar(estado);
  const listo = puedeReasignar(estado);

  useEffect(() => {
    if (!abierto) return;
    permisoSinPin().then((r) => setSinPinHasta(r.hasta));
  }, [abierto]);

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
      <DialogContent className="sm:max-w-md">
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

        {sinPin ? (
          /* Gerencia levantó el código por hoy (28-08): el servidor no lo va a
             mirar, así que la pantalla tampoco lo pide. El motivo sigue siendo
             obligatorio y la corrección se registra igual, marcada como hecha
             sin código. */
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-[12px] leading-snug">
            <p className="font-semibold text-foreground">Hoy no hace falta el código del supervisor.</p>
            <p className="text-muted-foreground">
              Gerencia autorizó corregir sin PIN hasta el final del día. La corrección igual queda registrada con su
              motivo, y mañana el código vuelve a pedirse.
            </p>
          </div>
        ) : (
          /* La caja de Plaza Vea, tal cual lo pidió el ing. Carlos el 27-08: la
             corrección la habilita un supervisor, no quien se equivocó. */
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
              Lo tiene en su barra lateral, en <b>«PIN de autorización»</b>. Cambia cada diez minutos y sirve para{" "}
              <b>una sola</b> corrección.
            </p>
          </div>
        )}

        <DialogFooter className="sm:flex-col sm:items-stretch sm:gap-2">
          {/* Un botón gris que no dice por qué está gris es una pared. Acá se
              enumera lo que falta, en el mismo orden del formulario: Central
              reportó el 28-08 que «el botón reasignar está inhabilitado» sin
              tener cómo saber qué le faltaba. */}
          {falta.length > 0 && (
            <p className="text-[11px] leading-snug text-amber-800">
              Para habilitar «Reasignar» falta: {falta.join(" · ")}
            </p>
          )}
          <Button disabled={enviando || !listo} onClick={guardar}>
            {enviando ? "Reasignando…" : "Reasignar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
