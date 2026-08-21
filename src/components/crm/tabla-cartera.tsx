"use client";

import { useRouter } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface FilaCartera {
  id: string;
  razonSocial: string;
  documento: string;
  distrito: string | null;
  /** Cuántas veces compró. Reemplazó al conteo de contactos: para decidir a
      quién llamar importa más si el cliente ya compró que cuántos teléfonos
      tiene guardados. */
  compras: number;
  totalUsd: number;
  oportunidadesActivas: number;
  ultimaVentaAt: string | null;
}

// Misma corrección que tabla-clientes.tsx / historial-cuenta.tsx (B9.3): la
// fila entera es el objetivo de clic, sin botón "Ver" que perseguir ni
// columna "Cliente" tan ancha que empuje la tabla a scroll horizontal.
export function TablaCartera({ filas }: { filas: FilaCartera[] }) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead>Zona</TableHead>
            <TableHead className="text-right">Compras</TableHead>
            <TableHead className="text-right">Abiertas</TableHead>
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
              onClick={() => router.push(`/comercial/cartera/${c.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`/comercial/cartera/${c.id}`);
              }}
              className="cursor-pointer transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <TableCell className="max-w-[280px] whitespace-normal">
                <span className="flex items-start gap-2 font-medium text-foreground">
                  <Building2 className="mt-0.5 size-3.5 flex-none text-muted-foreground" />
                  <span className="line-clamp-2 min-w-0" title={c.razonSocial}>
                    {c.razonSocial}
                  </span>
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{c.documento}</TableCell>
              <TableCell className="text-muted-foreground">{c.distrito ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {c.compras > 0 ? (
                  <>
                    {c.compras}
                    {c.totalUsd > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        US$ {Math.round(c.totalUsd).toLocaleString("es-PE")}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {c.oportunidadesActivas > 0 ? (
                  <span className="font-semibold text-primary">{c.oportunidadesActivas}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
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
