"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, UserCheck, Users } from "lucide-react";
import { fusionarCuentas } from "@/lib/acciones/cuentas";
import { permisoSinPin } from "@/lib/acciones/seguridad";
import type { CandidataRelacionada } from "@/lib/fichas-relacionadas";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { cn } from "@/lib/utils";

/**
 * «¿ES EL MISMO CLIENTE?» (ítem 9 de la reunión del 22-09).
 *
 * Carlos: «A mí cuando han derivado un cliente relacionado a otro me aparece
 * por defecto: dos relacionados, y yo puedo abrir. Acá Ruiz Pangalima
 * solamente aparece él.» Estas candidatas salen de un apellido raro
 * compartido o del mismo distrito y rubro — nunca se unen solas, siempre las
 * mira una persona antes.
 */
export function FichasRelacionadas({
  cuentaId,
  candidatas,
  supervisores = [],
}: {
  cuentaId: string;
  candidatas: CandidataRelacionada[];
  supervisores?: { id: string; nombre: string; rol?: string }[];
}) {
  const router = useRouter();
  const [elegida, setElegida] = useState<CandidataRelacionada | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [sinPinHasta, setSinPinHasta] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [enviando, startTransition] = useTransition();

  if (candidatas.length === 0) return null;

  const sinPin = sinPinHasta !== null;
  const digitos = pin.replace(/[^0-9]/g, "").length;
  const listo = Boolean(elegida) && motivo.trim().length >= 10 && (sinPin || digitos === 4);

  function abrir(c: CandidataRelacionada) {
    setElegida(c);
    setMotivo("");
    setPin("");
    setAbierto(true);
    permisoSinPin().then((r) => setSinPinHasta(r.hasta));
  }

  function guardar() {
    if (!listo || !elegida) return;
    startTransition(async () => {
      const r = await fusionarCuentas(cuentaId, elegida.id, pin, motivo);
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        setPin("");
        return;
      }
      toast.success(r.resumen ?? "Fichas unidas", { duration: 9000 });
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-amber-400/50 bg-amber-500/5 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
        <Users className="size-4" /> ¿Es el mismo cliente?
      </p>
      <p className="mt-1 text-xs text-amber-900/80">
        Esta ficha no tiene RUC. Estas otras se parecen: revíselas antes de tratarlas como clientes distintos.
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {candidatas.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-card px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{c.razonSocial}</span>
              <span className="block text-[11px] text-muted-foreground">
                {c.motivo}
                {c.comercialNombre ? ` · cartera de ${c.comercialNombre}` : ""}
              </span>
            </span>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-xs" onClick={() => abrir(c)}>
              <Link2 className="size-3.5" /> Unir a esta ficha
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unir a {elegida?.razonSocial}</DialogTitle>
            <DialogDescription>
              Todo lo de esta ficha —expedientes, contactos, atenciones y pedidos de postventa— pasa a la ficha
              elegida. Esta ficha queda marcada como fusionada, no se borra.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="motivo-fusion">Por qué es el mismo cliente</Label>
            <Textarea
              id="motivo-fusion"
              rows={2}
              placeholder="ej.: mismo apellido, el cliente confirmó por teléfono que es la misma empresa"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          {sinPin ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-[12px] leading-snug">
              <p className="font-semibold text-foreground">Hoy no hace falta el código.</p>
              <p className="text-muted-foreground">Gerencia lo levantó por el día. La corrección queda registrada igual.</p>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="space-y-1.5">
                <div>
                  <Label htmlFor="pin-fusion" className="text-sm">
                    Código de operaciones
                  </Label>
                  <p className="text-[11px] leading-snug text-muted-foreground">Cambia cada 10 min · pídalo a gerencia u operaciones</p>
                </div>
                <CampoCodigo id="pin-fusion" valor={pin} onChange={setPin} tono="amber" />
              </div>
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
            {!listo && (
              <p className="text-[11px] text-muted-foreground">
                {motivo.trim().length < 10 ? "Escriba por qué es el mismo cliente." : "Falta el código de operaciones."}
              </p>
            )}
            <Button
              onClick={guardar}
              disabled={!listo || enviando}
              className={cn(enviando && "opacity-70")}
            >
              {enviando ? "Uniendo…" : "Unir a esta ficha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
