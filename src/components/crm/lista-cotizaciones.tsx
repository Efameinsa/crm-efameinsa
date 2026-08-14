"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enviarCotizacion, registrarVenta } from "@/lib/acciones/cotizaciones";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface CotizacionResumen {
  id: string;
  codigo: string | null;
  serie: string;
  estado: string;
  estado_aprobacion: string;
  total: number;
  moneda: string;
}

const ETIQUETA_APROBACION: Record<string, string> = {
  auto_aprobada: "Aprobada",
  pendiente_gerencia: "Pendiente de gerencia",
  aprobada_gerencia: "Aprobada por gerencia",
  rechazada_gerencia: "Rechazada por gerencia",
};

export function ListaCotizaciones({ cotizaciones }: { cotizaciones: CotizacionResumen[] }) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();

  function onEnviar(id: string) {
    startTransition(async () => {
      const r = await enviarCotizacion(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Cotización enviada");
        router.refresh();
      }
    });
  }

  function onRegistrarVenta(id: string) {
    if (!confirm("¿Confirmar la venta con esta cotización?")) return;
    startTransition(async () => {
      const r = await registrarVenta(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Venta registrada");
        router.refresh();
      }
    });
  }

  if (cotizaciones.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay cotizaciones.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Código</TableHead>
          <TableHead>Serie</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Aprobación</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cotizaciones.map((c) => {
          const puedeEnviar = c.estado === "borrador" && (c.estado_aprobacion === "auto_aprobada" || c.estado_aprobacion === "aprobada_gerencia");
          const puedeVender = c.estado === "enviada" && (c.estado_aprobacion === "auto_aprobada" || c.estado_aprobacion === "aprobada_gerencia");
          return (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs">{c.codigo}</TableCell>
              <TableCell>{c.serie}</TableCell>
              <TableCell>
                {c.moneda} {c.total}
              </TableCell>
              <TableCell>
                <Badge variant={c.estado_aprobacion === "pendiente_gerencia" ? "destructive" : "secondary"}>
                  {ETIQUETA_APROBACION[c.estado_aprobacion]}
                </Badge>
              </TableCell>
              <TableCell>{c.estado}</TableCell>
              <TableCell className="flex justify-end gap-2">
                <a href={`/api/cotizaciones/${c.id}/pdf`} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                  Ver PDF
                </a>
                {puedeEnviar && (
                  <Button size="sm" variant="outline" disabled={enviando} onClick={() => onEnviar(c.id)}>
                    Enviar
                  </Button>
                )}
                {puedeVender && (
                  <Button size="sm" disabled={enviando} onClick={() => onRegistrarVenta(c.id)}>
                    Registrar venta
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
