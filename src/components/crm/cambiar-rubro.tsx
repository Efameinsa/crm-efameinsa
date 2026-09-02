"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tag, Pencil, Check, X } from "lucide-react";
import { cambiarRubroCuenta } from "@/lib/acciones/cuentas";
import { cn } from "@/lib/utils";

/**
 * El rubro del cliente, a la vista y con «Cambiar rubro» al lado.
 *
 * Carlos, 02-09: «que muestre si ya está en qué rubro está, y diga: este es
 * hotel, pero esto es una textil. Cambiar rubro o agregar rubro, cualquiera
 * de los dos, pero que te avise en qué rubro está». Sin código: es la propia
 * cartera del gestor y clasificar bien le mejora su propio filtro.
 *
 * Vive en la cabecera de la oportunidad y en la ficha del cliente, que es
 * donde el gestor está mirando cuando se da cuenta de que el rubro está mal.
 */
export function CambiarRubro({
  cuentaId,
  rubroId,
  rubros,
  compacto = false,
}: {
  cuentaId: string;
  rubroId: number | null;
  rubros: { id: number; nombre: string }[];
  compacto?: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(rubroId === null ? "" : String(rubroId));
  const [guardando, empezar] = useTransition();
  const actual = rubros.find((r) => r.id === rubroId)?.nombre ?? null;
  const esOtro = /^otro/i.test(actual ?? "");

  function guardar() {
    const nuevo = valor === "" ? null : Number(valor);
    if (nuevo === rubroId) {
      setEditando(false);
      return;
    }
    empezar(async () => {
      const r = await cambiarRubroCuenta(cuentaId, nuevo);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(nuevo === null ? "Rubro quitado" : `Rubro: ${rubros.find((x) => x.id === nuevo)?.nombre}`);
      setEditando(false);
      router.refresh();
    });
  }

  if (editando) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Tag className="size-3.5 text-muted-foreground" />
        <select
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          autoFocus
          className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          <option value="">Sin rubro</option>
          {rubros.map((r) => (
            <option key={r.id} value={String(r.id)}>
              {r.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <Check className="size-3.5" /> Guardar
        </button>
        <button
          type="button"
          onClick={() => {
            setValor(rubroId === null ? "" : String(rubroId));
            setEditando(false);
          }}
          className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Cancelar"
        >
          <X className="size-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Tag className="size-3.5 text-muted-foreground" />
      <span className={cn("text-xs", actual && !esOtro ? "text-foreground" : "font-medium text-amber-700")}>
        {actual ? (esOtro ? `Rubro: ${actual} (revisar)` : `Rubro: ${actual}`) : "Sin rubro"}
      </span>
      <button
        type="button"
        onClick={() => setEditando(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
          actual && !esOtro
            ? "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            : "border-amber-500/60 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20",
        )}
        title={actual ? "Cambiar el rubro de este cliente" : "Póngale rubro: es con lo que se filtra la cartera por sector"}
      >
        <Pencil className="size-3" /> {actual ? "Cambiar rubro" : "Agregar rubro"}
      </button>
      {compacto ? null : null}
    </span>
  );
}
