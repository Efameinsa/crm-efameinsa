"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { FicharMaquina } from "@/components/crm/fichar-maquina";

/**
 * «+ REGISTRAR OTRA MÁQUINA» EN EL CASO (reunión 25-09, Ruby y Lesly).
 *
 * «Hay clientes que en un solo registro tienen varias máquinas, pero acá sale
 * para agregar solamente una… cuando agregues esa serie, ese botón tiene que
 * activarse nuevamente para que agregues otra». El caso ya aceptaba varias
 * máquinas (0253), pero solo las que el cliente tenía en su parque: una
 * segunda máquina nueva no tenía por dónde entrar. Con esto se registra y se
 * suma al caso; el botón vuelve a aparecer para la siguiente.
 */
export function OtraMaquinaDelCaso({ atencionId, cuenta, hayPrincipal }: { atencionId: string; cuenta: { id: string; razonSocial: string }; hayPrincipal: boolean }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-accent"
      >
        <Plus className="size-3.5" /> {hayPrincipal ? "Registrar otra máquina del caso" : "Registrar la máquina (no está en su parque)"}
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">{hayPrincipal ? "Otra máquina del mismo caso" : "La máquina del caso"}</p>
        <button type="button" onClick={() => setAbierto(false)} className="cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Cerrar">
          <X className="size-3.5" />
        </button>
      </div>
      <FicharMaquina atencionId={atencionId} cuenta={cuenta} alTerminar={() => setAbierto(false)} />
    </div>
  );
}
