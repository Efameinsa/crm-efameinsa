"use client";

import { cn } from "@/lib/utils";
import { ETIQUETA_SEGUIMIENTO, SEGUIMIENTOS, type SeguimientoCartera } from "@/lib/seguimiento-cartera";

// Desplegable «Seguimiento» de Mi cartera (23-09, 0281). Ariana (C4): «¿cómo
// voy a gestionar si se le llamó o no?». Lo tenía en la Ruta de postventa y se
// le fue con la llave; ahora lo tiene cualquier comercial sobre su cartera.
//
// Es un campo del formulario GET de Mi cartera, como el de rubro: lo envía
// solo al cambiar, con la búsqueda y el orden que ya estén puestos.
export function FiltroSeguimiento({ valor, className }: { valor: SeguimientoCartera | null; className?: string }) {
  return (
    <label className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      Seguimiento:
      <select
        name="seg"
        aria-label="Filtrar por seguimiento"
        title="Clientes a los que ya se llamó (o se escribió, se visitó…) y a los que todavía no, en el período elegido."
        defaultValue={valor ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn(
          "h-8 cursor-pointer rounded-md border border-input bg-background px-2 text-xs",
          valor !== null ? "border-primary font-semibold text-primary" : "text-foreground",
        )}
      >
        <option value="">Todos</option>
        {SEGUIMIENTOS.map((s) => (
          <option key={s} value={s}>
            {ETIQUETA_SEGUIMIENTO[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
