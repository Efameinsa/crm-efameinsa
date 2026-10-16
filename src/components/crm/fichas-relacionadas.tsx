"use client";

import { useState } from "react";
import { Link2, Users } from "lucide-react";
import type { CandidataRelacionada } from "@/lib/fichas-relacionadas";
import { Button } from "@/components/ui/button";
import { DialogoUnirFichas } from "@/components/crm/dialogo-unir-fichas";

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
  cuentaNombre = "Esta ficha",
  candidatas,
  supervisores = [],
}: {
  cuentaId: string;
  cuentaNombre?: string;
  candidatas: CandidataRelacionada[];
  supervisores?: { id: string; nombre: string; rol?: string }[];
}) {
  const [elegida, setElegida] = useState<CandidataRelacionada | null>(null);
  const [abierto, setAbierto] = useState(false);

  if (candidatas.length === 0) return null;

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
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => {
                setElegida(c);
                setAbierto(true);
              }}
            >
              <Link2 className="size-3.5" /> Unir a esta ficha
            </Button>
          </li>
        ))}
      </ul>

      {elegida && (
        <DialogoUnirFichas
          abierto={abierto}
          onOpenChange={setAbierto}
          origen={{ id: cuentaId, razonSocial: cuentaNombre }}
          destino={{ id: elegida.id, razonSocial: elegida.razonSocial, comercial: elegida.comercialNombre ?? null }}
          supervisores={supervisores}
        />
      )}
    </div>
  );
}
