"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { pedirCartera } from "@/lib/acciones/cuentas";
import { permisoSinPin } from "@/lib/acciones/seguridad";
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
import { CampoCodigo } from "@/components/crm/campo-codigo";

/**
 * PEDIR PARA MI CARTERA EL CLIENTE QUE ESTÁ EN LA DE OTRO.
 *
 * Ariana, por Santos (09-09): quiso gestionar a RIVERA TRIGOSO JORGE RICARDO
 * —ya lo había hablado con Katerine, el cliente lo sigue ella— y al poner el
 * RUC el CRM le contestó que ese documento es de C5 y que pidiera el traspaso
 * a gerencia. Ahí terminaba: sabía a quién pedírselo y no tenía con qué.
 * Santos: «debería decirle que puede solicitar su cambio a su cartera con un
 * PIN».
 *
 * Aparece SOLO cuando el CRM ya frenó el guardado por ese motivo, y por eso no
 * es un botón de andar mirando carteras ajenas: sale en el momento exacto en
 * que la comercial choca con la pared, con el documento que ella misma tecleó.
 */
export function PedirCarteraBoton({
  numDoc,
  quien,
  onListo,
}: {
  numDoc: string;
  /** Quién lo tiene hoy, como se lee en pantalla: «C5 · Katerine Tello». */
  quien: string;
  onListo?: () => void;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [sinPin, setSinPin] = useState(false);
  const [pidiendo, startTransition] = useTransition();

  // A quién pedirle el código, y si hoy hace falta: gerencia puede levantarlo
  // por el día (0111) y entonces el campo sobra.
  useEffect(() => {
    if (!abierto) return;
    permisoSinPin().then(({ hasta }) => setSinPin(hasta !== null));
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    setMotivo("");
    setPin("");
  }

  function pedir() {
    if (motivo.trim().length < 10) {
      toast.error("Escriba por qué este cliente es suyo. Lo lee quien lo tiene hoy.");
      return;
    }
    startTransition(async () => {
      const r = await pedirCartera(numDoc, pin, motivo.trim());
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(r.resumen ?? "El cliente ya está en su cartera.", { duration: 9000 });
      cerrar();
      onListo?.();
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <UserPlus className="size-3.5" />
            Es mi cliente — pedirlo para mi cartera
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pedir este cliente para su cartera</DialogTitle>
          <DialogDescription>
            El RUC/DNI {numDoc} está hoy en la cartera de <b className="text-foreground">{quien}</b>. Si el cliente pasó
            a manos suyas, pídalo acá: se mueve la ficha con todos sus expedientes y quedan registrados el motivo y
            quién lo autorizó.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="motivo-cartera">Por qué este cliente es suyo</Label>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Lo lee el comercial que lo pierde. Una frase alcanza.
          </p>
          <Textarea
            id="motivo-cartera"
            rows={2}
            placeholder="ej.: el cliente me buscó a mí y ya lo conversé con quien lo tenía"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        {sinPin ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-[12px] leading-snug">
            <p className="font-semibold text-foreground">Hoy no hace falta el código.</p>
            <p className="text-muted-foreground">Gerencia lo levantó por el día. El traspaso queda registrado igual.</p>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="space-y-1.5">
              <div>
                <Label htmlFor="pin-cartera" className="text-sm">
                  Código del supervisor
                </Label>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Cambia cada 10 min · sirve para un solo traspaso
                </p>
              </div>
              <CampoCodigo id="pin-cartera" valor={pin} onChange={setPin} tono="amber" />
            </div>
          </div>
        )}

        {/* Lo que NO se lleva: dicho antes de apretar, no después. Las ventas
            de quien lo tenía siguen contadas a esa persona (decisión de Santos,
            09-09), y una institución con sedes no se mueve con un código. */}
        <p className="text-[11px] leading-snug text-muted-foreground">
          Las ventas y los cierres anteriores siguen contados a quien los hizo. Si el RUC es de una institución con
          varias sedes, el traspaso lo hace gerencia.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar} disabled={pidiendo}>
            Cancelar
          </Button>
          <Button onClick={pedir} disabled={pidiendo}>
            {pidiendo ? "Pidiendo…" : "Pedir el cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
