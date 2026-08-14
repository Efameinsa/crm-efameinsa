"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PuntoInteres } from "@/components/crm/punto-interes";
import { PipelineKanban, type OportunidadKanban } from "@/components/crm/pipeline-kanban";
import { cn } from "@/lib/utils";

export function VistaOportunidades({
  oportunidades,
  motivos,
}: {
  oportunidades: OportunidadKanban[];
  motivos: { id: number; nombre: string }[];
}) {
  const [vista, setVista] = useState<"kanban" | "tabla">("kanban");

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {(["kanban", "tabla"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              className={cn(
                "px-3.5 py-1.5 text-xs capitalize transition-colors",
                vista === v ? "bg-foreground text-background font-semibold" : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {vista === "kanban" ? (
        <PipelineKanban oportunidades={oportunidades} motivos={motivos} />
      ) : (
        <TablaOportunidades oportunidades={oportunidades} />
      )}
    </div>
  );
}

function TablaOportunidades({ oportunidades }: { oportunidades: OportunidadKanban[] }) {
  if (oportunidades.length === 0) {
    return <p className="text-sm text-muted-foreground">Aún no tiene oportunidades asignadas.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cuenta</TableHead>
          <TableHead>Etapa</TableHead>
          <TableHead>Interés de compra</TableHead>
          <TableHead className="text-right">Monto estimado</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {oportunidades.map((op) => (
          <TableRow key={op.id}>
            <TableCell>{op.razon_social}</TableCell>
            <TableCell>
              <Badge variant="secondary" className="capitalize">
                {op.etapa}
              </Badge>
            </TableCell>
            <TableCell>
              <PuntoInteres intencion={op.intencion} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {op.monto_estimado ? `${op.moneda} ${op.monto_estimado.toLocaleString("es-PE")}` : "—"}
            </TableCell>
            <TableCell className="text-right">
              <Link href={`/comercial/oportunidades/${op.id}`} className="text-sm text-primary hover:underline">
                Ver
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
