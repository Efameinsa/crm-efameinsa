"use client";

import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MarcaServidor } from "@/components/crm/marca-servidor";
import { fechaLima } from "@/lib/fechas";
import type { FilaClienteListado } from "@/lib/reportes";

// La fila entera es el objetivo de clic (patrón de tabla-por-comercial.tsx):
// nada de botón "Ver" que haya que perseguir al final de la fila.
export function TablaClientes({ filas, baseHref = "/gerencia/clientes" }: { filas: FilaClienteListado[]; baseHref?: string }) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Comercial dueño</TableHead>
            <TableHead>Zona</TableHead>
            <TableHead className="text-right" title="Oportunidades abiertas hoy">
              Abiertas
            </TableHead>
            <TableHead className="text-right" title="Ventas registradas (histórico incluido)">
              Compras
            </TableHead>
            <TableHead className="text-right">Total US$</TableHead>
            <TableHead>Última venta</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((c) => (
            <TableRow
              key={c.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`${baseHref}/${c.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`${baseHref}/${c.id}`);
              }}
              className="cursor-pointer transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <TableCell className="max-w-[320px] whitespace-normal">
                <p className="line-clamp-2 font-medium text-foreground" title={c.razon_social}>
                  {c.razon_social} {c.con_servidor && <MarcaServidor />}
                </p>
                {c.tipo_doc !== "SIN_DOC" ? (
                  <p className="text-xs text-muted-foreground">
                    {c.tipo_doc}: {c.num_doc}
                  </p>
                ) : (
                  <p className="text-xs text-amber-700">Falta RUC/DNI</p>
                )}
              </TableCell>
              <TableCell>
                {c.comercial_nombre ? (
                  <span className="text-foreground">
                    {c.comercial_nombre}
                    {c.codigo_comercial ? ` (${c.codigo_comercial})` : ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sin asignar</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{c.distrito ?? c.departamento ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{c.abiertas}</TableCell>
              <TableCell className="text-right tabular-nums">{c.n_ventas}</TableCell>
              <TableCell className="text-right tabular-nums">
                {c.total_usd > 0 ? Math.round(c.total_usd).toLocaleString("es-PE") : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{c.ultima_venta_at ? fechaLima(c.ultima_venta_at) : "Nunca"}</TableCell>
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
