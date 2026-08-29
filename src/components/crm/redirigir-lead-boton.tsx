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
import { cn } from "@/lib/utils";

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
  supervisores?: { id: string; nombre: string; rol?: string }[];
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
          /* Con nombre y de tamaño usable: el ícono suelto de 28 px no se
             encontraba y no decía qué hacía (Darwin, 28-08). */
          <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5">
            <ArrowRightLeft className="size-4" />
            <span className="hidden sm:inline">Corregir</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Corregir la derivación</DialogTitle>
          {/* Corto a propósito: el detalle de cuándo se puede y cuándo no lo
              dice la base al intentarlo, con su motivo. Explicarlo todo acá de
              antemano era un párrafo que nadie lee (28-08). */}
          <DialogDescription>
            <b>{contacto}</b> pasa al comercial que corresponda.
          </DialogDescription>
        </DialogHeader>

        {/* Elegir a quién: botones grandes en vez de un desplegable. Son cinco
            comerciales, se ven todos de un vistazo y se elige de un toque. */}
        <div className="space-y-1.5">
          <Label>Pasarlo a</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {opciones.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setDestino(c.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
                  destino === c.id
                    ? "border-primary bg-primary/10 font-semibold text-foreground"
                    : "border-border hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 flex-none items-center justify-center rounded-full text-[11px] font-bold",
                    destino === c.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {c.codigo_comercial ?? "—"}
                </span>
                <span className="min-w-0 truncate">{c.nombre}</span>
              </button>
            ))}
          </div>
        </div>

        {/* El motivo NO es burocracia: es lo único que después va a explicar
            por qué se derivó mal. */}
        <div className="space-y-1.5">
          <Label htmlFor="motivo">¿Por qué?</Label>
          <Textarea
            id="motivo"
            rows={2}
            placeholder="ej.: pedía mantenimiento, no una máquina nueva"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        {sinPin ? (
          /* Gerencia levantó el código por hoy (28-08): el servidor no lo va a
             mirar, así que la pantalla tampoco lo pide. El motivo sigue siendo
             obligatorio y la corrección se registra igual, marcada como hecha
             sin código. */
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-[12px] leading-snug">
            <p className="font-semibold text-foreground">Hoy no hace falta el código.</p>
            <p className="text-muted-foreground">Gerencia lo levantó por el día. La corrección queda registrada igual.</p>
          </div>
        ) : (
          /* La caja de Plaza Vea, tal cual lo pidió el ing. Carlos el 27-08: la
             corrección la habilita un supervisor, no quien se equivocó. */
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="flex items-center gap-3">
              <input
                id="pin"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="0000"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="h-12 w-28 flex-none rounded-lg border border-input bg-background text-center font-mono text-2xl tracking-[0.3em]"
              />
              <div className="min-w-0 flex-1">
                <Label htmlFor="pin" className="text-sm">
                  Código del supervisor
                </Label>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Cambia cada 10 min · sirve para una corrección
                </p>
              </div>
            </div>
            {/* CON NOMBRE Y APELLIDO. Pedir «el código del supervisor» sin decir
                de quién dejaba a Central sin saber a quién llamar (27-08). La
                lista la da la base, con el mismo criterio con que valida (0117). */}
            {supervisores.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                <span className="mr-0.5 inline-flex items-center gap-1 font-semibold text-foreground">
                  <UserCheck className="size-3.5" />
                  Pídaselo a:
                </span>
                {supervisores.map((s) => (
                  <span key={s.id} className="rounded-full bg-background px-2 py-0.5 text-muted-foreground">
                    {s.nombre}
                    {s.rol && s.rol !== "gerencia" ? ` · ${s.rol}` : ""}
                  </span>
                ))}
              </div>
            )}
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
            {enviando ? "Pasando el contacto…" : "Pasar el contacto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
