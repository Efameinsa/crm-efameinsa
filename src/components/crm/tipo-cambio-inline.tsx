"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { actualizarTipoCambio } from "@/lib/acciones/parametros";

// "T.C. 3.75 ✎": el número editable en el mismo lugar donde se lee. Sin
// pantalla aparte para un solo parámetro que gerencia cambia cada tanto.
export function TipoCambioInline({ valor, editable }: { valor: number; editable: boolean }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(String(valor));
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  if (!editable) return <span className="tabular-nums">T.C. {valor}</span>;

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => {
          setTexto(String(valor));
          setEditando(true);
        }}
        className="inline-flex cursor-pointer items-center gap-1 rounded px-1 tabular-nums underline decoration-dotted underline-offset-2 hover:bg-accent hover:text-foreground"
        title="Cambiar el tipo de cambio USD→PEN"
      >
        T.C. {valor} <Pencil className="size-3" />
      </button>
    );
  }

  function guardar() {
    const n = Number(texto.replace(",", "."));
    startTransition(async () => {
      const { error } = await actualizarTipoCambio(n);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`Tipo de cambio actualizado a ${n}`);
      setEditando(false);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span>T.C.</span>
      <input
        type="number"
        step="0.01"
        min="0.5"
        max="20"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") guardar();
          if (e.key === "Escape") setEditando(false);
        }}
        autoFocus
        className="h-6 w-16 rounded border border-input bg-background px-1 text-xs tabular-nums text-foreground"
        aria-label="Tipo de cambio USD a PEN"
      />
      <button type="button" onClick={guardar} disabled={pendiente} className="cursor-pointer rounded p-0.5 text-[#1E7F4F] hover:bg-accent" title="Guardar">
        {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      </button>
      <button type="button" onClick={() => setEditando(false)} className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-accent" title="Cancelar">
        <X className="size-3.5" />
      </button>
    </span>
  );
}
