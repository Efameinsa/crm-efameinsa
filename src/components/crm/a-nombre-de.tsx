"use client";

import { useState, useTransition } from "react";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { agregarEmpresaDelGrupo } from "@/lib/acciones/cuentas";
import type { EmpresaDelGrupo } from "@/lib/datos-cotizador";

/**
 * A NOMBRE DE QUIÉN SALE LA COTIZACIÓN (0310, Katerine 25-09).
 *
 * CONGELADOS Y FRESCOS pidió una cotización a nombre de otra empresa suya
 * (CORPORACION REFRIGERADOS INY). El cliente es uno solo —un expediente, un
 * comercial—; lo que cambia es la razón social que imprime el PDF. Si la
 * empresa todavía no está en el grupo, se agrega acá mismo con su RUC.
 */
export function ANombreDe({
  cuentaId,
  empresas,
  valor,
  bloqueado,
  onCambiar,
}: {
  /** La cuenta del expediente. */
  cuentaId: string;
  empresas: EmpresaDelGrupo[];
  /** La empresa elegida; null = la del expediente. */
  valor: string | null;
  bloqueado?: boolean;
  onCambiar: (cuentaId: string | null, empresa: EmpresaDelGrupo) => void;
}) {
  const [lista, setLista] = useState(empresas);
  const [abierto, setAbierto] = useState(false);
  const [ruc, setRuc] = useState("");
  const [razon, setRazon] = useState("");
  const [direccion, setDireccion] = useState("");
  const [pendiente, startTransition] = useTransition();

  const elegida = valor ?? cuentaId;

  function elegir(id: string) {
    const empresa = lista.find((e) => e.id === id);
    if (!empresa) return;
    onCambiar(id === cuentaId ? null : id, empresa);
  }

  function agregar() {
    startTransition(async () => {
      const r = await agregarEmpresaDelGrupo({ cuentaId, ruc, razonSocial: razon, direccion });
      if (r.error || !r.empresa) {
        toast.error(r.error ?? "No se pudo agregar la empresa");
        return;
      }
      const nueva: EmpresaDelGrupo = { id: r.empresa.id, razonSocial: r.empresa.razonSocial, numDoc: r.empresa.numDoc, esMadre: false };
      setLista((l) => (l.some((e) => e.id === nueva.id) ? l : [...l, nueva]));
      setAbierto(false);
      setRuc("");
      setRazon("");
      setDireccion("");
      toast.success(`${nueva.razonSocial} quedó en el grupo del cliente`);
      onCambiar(nueva.id, nueva);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1 font-semibold text-foreground">
        <Building2 className="size-3.5 text-muted-foreground" /> A nombre de
      </span>
      <select
        value={elegida}
        disabled={bloqueado || pendiente}
        onChange={(e) => elegir(e.target.value)}
        aria-label="Empresa a cuyo nombre sale la cotización"
        className="h-7 max-w-[22rem] truncate rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground"
      >
        {lista.map((e) => (
          <option key={e.id} value={e.id}>
            {e.razonSocial}
            {e.numDoc ? ` · ${e.numDoc}` : ""}
            {e.id === cuentaId ? " (el cliente)" : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={bloqueado || pendiente}
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50"
      >
        <Plus className="size-3.5" /> Otra empresa del grupo
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Agregar una empresa del grupo</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Para cuando el cliente pide la cotización a nombre de otra razón social suya. Queda dentro de la misma
            ficha: el mismo expediente, la misma historia y su misma cartera.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="grupo-ruc">RUC</Label>
              <Input id="grupo-ruc" inputMode="numeric" maxLength={11} value={ruc} onChange={(e) => setRuc(e.target.value.replace(/\D/g, ""))} placeholder="20XXXXXXXXX" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="grupo-razon">Razón social</Label>
              <Input id="grupo-razon" value={razon} onChange={(e) => setRazon(e.target.value)} placeholder="Como figura en SUNAT" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="grupo-dir">Dirección fiscal</Label>
              <Input id="grupo-dir" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="La que va en la cotización" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button onClick={agregar} disabled={pendiente || ruc.length !== 11 || razon.trim().length < 3}>
              {pendiente ? "Agregando…" : "Agregar y cotizar a su nombre"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
