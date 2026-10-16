"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, UserCheck } from "lucide-react";
import { fusionarCuentas } from "@/lib/acciones/cuentas";
import { permisoSinPin } from "@/lib/acciones/seguridad";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { cn } from "@/lib/utils";

export interface FichaEnUnion {
  id: string;
  razonSocial: string;
  documento?: string | null;
  comercial?: string | null;
}

/**
 * UNIR DOS FICHAS DEL MISMO CLIENTE. Salió de «¿Es el mismo cliente?» (22-09)
 * para usarse también desde el aviso de la serie que ya está en otra ficha
 * (Santos, 16-10: «debería tener la funcionalidad para unir las fichas»).
 *
 * Muestra las dos fichas y hacia dónde va todo, pide el motivo y el código de
 * operaciones (unir mueve carteras), y si falta algo lo dice debajo del botón.
 */
export function DialogoUnirFichas({
  abierto,
  onOpenChange,
  origen,
  destino,
  supervisores = [],
  motivoInicial = "",
  alUnir,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  origen: FichaEnUnion;
  destino: FichaEnUnion;
  supervisores?: { id: string; nombre: string; rol?: string }[];
  motivoInicial?: string;
  alUnir?: (resumen: string) => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState(motivoInicial);
  const [pin, setPin] = useState("");
  const [sinPinHasta, setSinPinHasta] = useState<string | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  useEffect(() => {
    if (!abierto) return;
    setMotivo(motivoInicial);
    setPin("");
    setProblema(null);
    permisoSinPin().then((r) => setSinPinHasta(r.hasta));
  }, [abierto, motivoInicial]);

  const sinPin = sinPinHasta !== null;
  const digitos = pin.replace(/[^0-9]/g, "").length;
  const falta = motivo.trim().length < 10 ? "Escriba por qué es el mismo cliente (mínimo una frase)." : !sinPin && digitos !== 4 ? "Falta el código de operaciones." : null;

  function unir() {
    if (falta) return;
    setProblema(null);
    startTransition(async () => {
      const r = await fusionarCuentas(origen.id, destino.id, pin, motivo);
      if (r.error) {
        // A la vista, no en un aviso que se va solo: es lo que hay que resolver.
        setProblema(r.error);
        setPin("");
        return;
      }
      toast.success(r.resumen ?? "Fichas unidas", { duration: 9000 });
      onOpenChange(false);
      alUnir?.(r.resumen ?? "Fichas unidas");
      router.refresh();
    });
  }

  const Tarjeta = ({ f, rotulo }: { f: FichaEnUnion; rotulo: string }) => (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">{f.razonSocial}</p>
      <p className="text-[11px] text-muted-foreground">
        {f.documento ?? "Sin RUC"}
        {f.comercial ? ` · cartera de ${f.comercial}` : ""}
      </p>
    </div>
  );

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Unir las dos fichas</DialogTitle>
          <DialogDescription>
            Todo lo de la primera —expedientes, contactos, casos, máquinas y pedidos— pasa a la segunda. La primera queda
            marcada como unida, no se borra. Si fue un error, administración lo puede deshacer desde el registro de acciones.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Tarjeta f={origen} rotulo="Se une" />
          <ArrowRight className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" />
          <Tarjeta f={destino} rotulo="Se queda" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="motivo-union">Por qué es el mismo cliente</Label>
          <Textarea
            id="motivo-union"
            rows={2}
            placeholder="ej.: misma empresa, una ficha sin RUC y con el nombre mal escrito"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        {sinPin ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-[12px] leading-snug">
            <p className="font-semibold text-foreground">Hoy no hace falta el código.</p>
            <p className="text-muted-foreground">Gerencia lo levantó por el día. La unión queda registrada igual.</p>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="space-y-1.5">
              <div>
                <Label htmlFor="pin-union" className="text-sm">
                  Código de operaciones
                </Label>
                <p className="text-[11px] leading-snug text-muted-foreground">Cambia cada 10 min · pídalo a gerencia u operaciones</p>
              </div>
              <CampoCodigo id="pin-union" valor={pin} onChange={setPin} tono="amber" />
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

        {problema && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-snug text-destructive">
            {problema}
          </p>
        )}

        <DialogFooter className="sm:flex-col sm:items-stretch sm:gap-2">
          {falta && <p className="text-[11px] text-muted-foreground">{falta}</p>}
          <Button onClick={unir} disabled={Boolean(falta) || enviando} className={cn(enviando && "opacity-70")}>
            {enviando ? "Uniendo…" : "Unir las fichas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
