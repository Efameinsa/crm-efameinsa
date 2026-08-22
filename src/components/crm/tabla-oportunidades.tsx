"use client";

import { useRouter } from "next/navigation";
import { Building2, ChevronRight, User } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { PuntoInteres } from "@/components/crm/punto-interes";
import type { FilaOportunidadListado } from "@/lib/reportes";

// Presentacional pura: la página ya trae la fila filtrada, ordenada y
// paginada desde listar_oportunidades() (migración 0054) — antes esta tabla
// filtraba y ordenaba en el navegador sobre TODA la cartera del comercial,
// que con la importación histórica del 21-08 puede ser de miles de filas.
export function TablaOportunidades({ filas }: { filas: FilaOportunidadListado[] }) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Etapa</TableHead>
            <TableHead>Interés</TableHead>
            <TableHead className="text-right">Monto estimado</TableHead>
            <TableHead>Para retomar</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((op) => (
            <TableRow
              key={op.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/comercial/oportunidades/${op.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`/comercial/oportunidades/${op.id}`);
              }}
              className="cursor-pointer transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <TableCell className="max-w-[280px] whitespace-normal">
                <span className="flex items-start gap-2 font-medium text-foreground">
                  {op.es_empresa ? (
                    <Building2 className="mt-0.5 size-3.5 flex-none text-muted-foreground" />
                  ) : (
                    <User className="mt-0.5 size-3.5 flex-none text-muted-foreground" />
                  )}
                  <span className="line-clamp-2 min-w-0" title={op.razon_social}>
                    {op.razon_social}
                  </span>
                  {op.origen !== "crm" && (
                    <span className="mt-0.5 flex-none rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Excel
                    </span>
                  )}
                </span>
              </TableCell>
              <TableCell>
                <EtapaBadge etapa={op.etapa} />
                {op.cotizacion_estado === "pendiente_gerencia" && (
                  <span className="ml-1.5 text-[10px] text-amber-700">pend. gerencia</span>
                )}
                {op.cotizacion_estado === "rechazada_gerencia" && (
                  <span className="ml-1.5 text-[10px] text-destructive">rechazada</span>
                )}
              </TableCell>
              <TableCell>
                <PuntoInteres intencion={op.intencion} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {op.monto_estimado ? `${op.moneda} ${op.monto_estimado.toLocaleString("es-PE")}` : "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {op.proxima_accion_at ? (
                  <>
                    {new Date(op.proxima_accion_at).toLocaleDateString("es-PE")}
                    {op.proxima_accion && <span className="ml-1 text-xs">· {op.proxima_accion}</span>}
                  </>
                ) : (
                  op.proxima_accion || "—"
                )}
              </TableCell>
              <TableCell>
                <ChevronRight className="size-4 text-muted-foreground" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
