"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, UserCheck } from "lucide-react";
import { fusionarCuentas } from "@/lib/acciones/cuentas";
import { permisoSinPin } from "@/lib/acciones/seguridad";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import type { FichaEnUnion } from "@/components/crm/dialogo-unir-fichas";
import { cn } from "@/lib/utils";

/**
 * UNIR VARIAS FICHAS DESDE LA LISTA (Brenda, 23-10).
 *
 * Buscó «logisminsa» y le salieron tres fichas del mismo cliente (una con RUC
 * y compras, dos sin RUC en la cartera de C1): «unir, uno solo, es lo mismo».
 * Hasta hoy la unión era de a dos y desde dentro de una ficha («Unir con otra
 * ficha», 0558). Acá se marcan las repetidas en la lista, se elige cuál se
 * queda (propuesta: la que tiene RUC y más compras) y todo lo demás se une a
 * esa, una por una, con el mismo motivo y el mismo código. Las reglas de
 * siempre las sigue poniendo la base (`fusionar_cuentas`): código de
 * operaciones si se mueve cartera, sin código si las fichas son de quien une
 * o gerencia lo levantó por el día; nada se borra y se puede deshacer.
 */
export function UnirSeleccionadas({
  fichas,
  supervisores = [],
  abierto,
  onOpenChange,
}: {
  fichas: (FichaEnUnion & { compras?: number })[];
  supervisores?: { id: string; nombre: string; rol?: string }[];
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const sugerida = [...fichas].sort((a, b) => Number(Boolean(b.documento)) - Number(Boolean(a.documento)) || (b.compras ?? 0) - (a.compras ?? 0))[0];
  const [destinoId, setDestinoId] = useState<string>(sugerida?.id ?? "");
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [sinPinHasta, setSinPinHasta] = useState<string | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [avance, setAvance] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  // El estado se reinicia porque la tabla monta este diálogo con una `key`
  // distinta cada vez que se abre; acá solo se consulta si hoy hace falta el código.
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    permisoSinPin().then((r) => {
      if (vivo) setSinPinHasta(r.hasta);
    });
    return () => {
      vivo = false;
    };
  }, [abierto]);

  const destino = fichas.find((f) => f.id === destinoId) ?? null;
  const origenes = fichas.filter((f) => f.id !== destinoId);
  const sinPin = sinPinHasta !== null;
  const digitos = pin.replace(/[^0-9]/g, "").length;
  const falta =
    fichas.length < 2
      ? "Marque al menos dos fichas."
      : !destino
        ? "Elija cuál se queda."
        : motivo.trim().length < 10
          ? "Escriba por qué es el mismo cliente (mínimo una frase)."
          : !sinPin && digitos !== 4
            ? "Falta el código de operaciones (si las fichas son suyas, la base no lo pedirá)."
            : null;

  function unir() {
    if (falta || !destino) return;
    setProblema(null);
    startTransition(async () => {
      let unidas = 0;
      for (const o of origenes) {
        setAvance(`Uniendo ${o.razonSocial}…`);
        const r = await fusionarCuentas(o.id, destino.id, pin, motivo);
        if (r.error) {
          setProblema(`${o.razonSocial}: ${r.error}${unidas ? ` (ya se unieron ${unidas}).` : ""}`);
          setAvance(null);
          setPin("");
          router.refresh();
          return;
        }
        unidas++;
      }
      toast.success(`${unidas} ficha${unidas === 1 ? "" : "s"} unida${unidas === 1 ? "" : "s"} a ${destino.razonSocial}`, { duration: 9000 });
      onOpenChange(false);
      router.push(`/nuevo/cliente/${destino.id}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Unir {fichas.length} fichas del mismo cliente</DialogTitle>
          <DialogDescription>
            Elija cuál se queda. Todo lo de las otras —expedientes, contactos, casos, máquinas y pedidos— pasa a esa. Las demás quedan marcadas
            como unidas, no se borran; si fue un error, administración lo deshace desde el registro de acciones.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cuál se queda</p>
          <ul className="space-y-1">
            {fichas.map((f) => (
              <li key={f.id}>
                <label className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm", f.id === destinoId ? "border-primary bg-primary/5" : "border-border hover:bg-accent")}>
                  <input type="radio" name="se-queda" className="mt-1" checked={f.id === destinoId} onChange={() => setDestinoId(f.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug text-foreground">{f.razonSocial}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {f.documento ?? "Sin RUC"}
                      {f.comercial ? ` · cartera de ${f.comercial}` : ""}
                      {f.compras ? ` · ${f.compras} compra${f.compras === 1 ? "" : "s"}` : ""}
                      {f.id === sugerida?.id ? " · sugerida" : ""}
                    </span>
                  </span>
                  {f.id === destinoId ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">se queda</span> : <span className="text-[10px] text-muted-foreground">se une</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="motivo-union-varias">Por qué es el mismo cliente</Label>
          <Textarea id="motivo-union-varias" rows={2} placeholder="ej.: misma empresa, dos fichas sin RUC con el nombre corto" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
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
                <Label htmlFor="pin-union-varias" className="text-sm">
                  Código de operaciones
                </Label>
                <p className="text-[11px] leading-snug text-muted-foreground">Cambia cada 10 min · pídalo a gerencia u operaciones. Si todas las fichas son suyas, se une sin código.</p>
              </div>
              <CampoCodigo id="pin-union-varias" valor={pin} onChange={setPin} tono="amber" />
            </div>
            {supervisores.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                <span className="mr-0.5 inline-flex items-center gap-1 font-semibold text-foreground">
                  <UserCheck className="size-3.5" /> Pídaselo a:
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

        {avance && <p className="text-xs text-muted-foreground">{avance}</p>}
        {problema && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-snug text-destructive">
            {problema}
          </p>
        )}

        <DialogFooter className="sm:flex-col sm:items-stretch sm:gap-2">
          {falta && <p className="text-[11px] text-muted-foreground">{falta}</p>}
          <Button onClick={unir} disabled={Boolean(falta) || enviando} className={cn(enviando && "opacity-70")}>
            <Link2 className="size-4" /> {enviando ? "Uniendo…" : `Unir ${origenes.length} ficha${origenes.length === 1 ? "" : "s"} a la que se queda`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
