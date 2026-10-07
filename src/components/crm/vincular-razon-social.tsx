"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { pedirUnionRazonSocial, vincularOtraRazonSocial } from "@/lib/acciones/cuentas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * «Este cliente también factura con otra empresa» (reunión 28-09, con Karina
 * Saavedra / Amazonas Grandez: «que lo permita hacer el comercial»). Crea o
 * vincula la otra razón social en el grupo del cliente (0326).
 */
export function VincularRazonSocial({ cuentaId, razonSocial }: { cuentaId: string; razonSocial: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [doc, setDoc] = useState("");
  const [razon, setRazon] = useState("");
  const [pendiente, startTransition] = useTransition();
  const [ajena, setAjena] = useState(false);

  function guardar() {
    startTransition(async () => {
      const r = await vincularOtraRazonSocial(cuentaId, doc, razon);
      if (r.error) {
        // El RUC es cliente de otro comercial: no se puede solo, se le pide a gerencia.
        setAjena(/autoriza gerencia/.test(r.error));
        return void toast.error(r.error, { duration: 8000 });
      }
      toast.success("Listo: la otra razón social quedó en el grupo de este cliente.");
      setAbierto(false);
      setDoc("");
      setRazon("");
      router.refresh();
    });
  }

  function pedir() {
    startTransition(async () => {
      const r = await pedirUnionRazonSocial(cuentaId, doc);
      if (r.error) return void toast.error(r.error, { duration: 8000 });
      toast.success("Listo: le pedimos a gerencia que la una. Le avisamos apenas se decida.");
      setAbierto(false);
      setAjena(false);
      setDoc("");
      setRazon("");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
      >
        <Building2 className="size-3.5" /> Factura también con otra empresa
      </button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Otra razón social de este cliente</DialogTitle>
            <DialogDescription>
              {razonSocial} compra también con otra empresa (otro RUC). Si esa ficha ya existe se une al grupo; si no, se crea en su misma
              cartera. No se fusionan: cada cotización sale a nombre de una.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">RUC (o DNI) de la otra empresa</Label>
              <Input value={doc} onChange={(e) => { setDoc(e.target.value.replace(/[^0-9]/g, "")); setAjena(false); }} inputMode="numeric" maxLength={11} autoFocus />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Razón social (si todavía no está en el CRM)</Label>
              <Input value={razon} onChange={(e) => setRazon(e.target.value.toUpperCase())} placeholder="KARINA SAAVEDRA HOSPEDAJE E.I.R.L." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            {ajena && (
              <Button variant="outline" onClick={pedir} disabled={pendiente}>
                Pedirle a gerencia que la una
              </Button>
            )}
            <Button onClick={guardar} disabled={pendiente || ![8, 11].includes(doc.length)}>
              {pendiente && <Loader2 className="size-4 animate-spin" />}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
