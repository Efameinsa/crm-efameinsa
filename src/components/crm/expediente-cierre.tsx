"use client";

import { useState } from "react";
import { FileText, FolderOpen, Truck, Wallet } from "lucide-react";
import { AdjuntosCierre } from "@/components/crm/adjuntos-cierre";
import { CompendioGestion } from "@/components/crm/compendio-gestion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fechaCalendario } from "@/lib/fechas";
import type { AdjuntoCierreFirmado } from "@/lib/adjuntos-cierre";
import type { Compendio } from "@/lib/compendio-cierre";

/**
 * El expediente de un cierre, completo, cuando hace falta mirarlo.
 *
 * POR QUÉ EN UN MODAL Y NO EN LA FILA. La cola de Central tenía nueve columnas
 * y cada fila medía media pantalla: la nota de despacho de un cliente ocupa
 * cuatro renglones, el expediente son cinco documentos y el compendio de la
 * gestión son seis hitos más. Todo eso junto convierte una lista de veinte
 * cierres en un scroll de diez minutos, y lo que Central hace veinte veces al
 * día —mirar de quién es, cuánto es y marcar los dos checks— queda enterrado.
 *
 * Así que la fila muestra lo que se ESCANEA y el modal guarda lo que se LEE. Se
 * abre en el momento en que hace falta —antes de facturar, o cuando alguien
 * pregunta por qué se dio ese precio— y se cierra.
 */
export function ExpedienteCierre({
  informeId,
  codigo,
  cliente,
  clienteDoc,
  serie,
  monto,
  moneda,
  modalidadPago,
  entregaLugar,
  entregaFecha,
  adjuntos,
  compendio,
}: {
  informeId: string;
  codigo: string;
  cliente: string;
  clienteDoc: string | null;
  serie: string;
  monto: number;
  moneda: string;
  modalidadPago: string[];
  entregaLugar: string | null;
  entregaFecha: string | null;
  adjuntos: AdjuntoCierreFirmado[];
  compendio: Compendio | null;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <FolderOpen className="size-3.5" />
            Expediente
            <span className="ml-0.5 rounded-full bg-secondary px-1.5 text-[11px] font-semibold tabular-nums">
              {adjuntos.length}
            </span>
          </Button>
        }
      />
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Informe N.º {codigo} · {serie === "OPEN" ? "Open Investments" : "Efameinsa"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-base font-semibold text-foreground">{cliente}</p>
            {clienteDoc && <p className="font-mono text-xs text-muted-foreground">{clienteDoc}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Dato icono={<Wallet className="size-3.5" />} titulo="Monto">
              <span className="font-semibold tabular-nums">
                {moneda} {Number(monto).toLocaleString("es-PE")}
              </span>
            </Dato>
            <Dato icono={<Wallet className="size-3.5" />} titulo="Forma de pago">
              {modalidadPago.length ? modalidadPago.join(" + ") : "—"}
            </Dato>
            <Dato icono={<Truck className="size-3.5" />} titulo="Entrega">
              {entregaFecha ? fechaCalendario(entregaFecha) : "sin fecha"}
            </Dato>
          </div>

          {entregaLugar && (
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Dónde va</p>
              <p className="mt-0.5 whitespace-pre-line text-sm">{entregaLugar}</p>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Documentos del expediente
            </p>
            <AdjuntosCierre informeId={informeId} adjuntos={adjuntos} emitido />
          </div>

          {compendio && <CompendioGestion compendio={compendio} />}

          <a
            href={`/api/informes/${informeId}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <FileText className="size-4" /> Abrir el informe en PDF
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Dato({ icono, titulo, children }: { icono: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {icono}
        {titulo}
      </p>
      <p className="mt-0.5 text-sm text-foreground">{children}</p>
    </div>
  );
}
