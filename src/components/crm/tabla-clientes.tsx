"use client";

import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface FilaCliente {
  id: string;
  razonSocial: string;
  tipoDoc: string;
  numDoc: string | null;
  distrito: string | null;
  comercialNombre: string | null;
  comercialCodigo: string | null;
  abiertas: number;
  ultimaVentaAt: string | null;
}

// La fila entera es el objetivo de clic (patrón de tabla-por-comercial.tsx):
// nada de botón "Ver" que haya que perseguir al final de la fila.
export function TablaClientes({ filas }: { filas: FilaCliente[] }) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Comercial dueño</TableHead>
            <TableHead>Zona</TableHead>
            <TableHead className="text-right">Oport. abiertas</TableHead>
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
              onClick={() => router.push(`/gerencia/clientes/${c.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`/gerencia/clientes/${c.id}`);
              }}
              className="cursor-pointer transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <TableCell className="max-w-[320px] whitespace-normal">
                <p className="line-clamp-2 font-medium text-foreground" title={c.razonSocial}>
                  {c.razonSocial}
                </p>
                {c.tipoDoc !== "SIN_DOC" && (
                  <p className="text-xs text-muted-foreground">
                    {c.tipoDoc}: {c.numDoc}
                  </p>
                )}
              </TableCell>
              <TableCell>
                {c.comercialNombre ? (
                  <span className="text-foreground">
                    {c.comercialNombre}
                    {c.comercialCodigo ? ` (${c.comercialCodigo})` : ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sin asignar</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{c.distrito ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{c.abiertas}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {c.ultimaVentaAt ? new Date(c.ultimaVentaAt).toLocaleDateString("es-PE") : "Nunca"}
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
