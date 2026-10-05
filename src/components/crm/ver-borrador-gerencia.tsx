"use client";

import { FileDown } from "lucide-react";
import { VerPdfEnLaApp } from "@/components/crm/ver-pdf-en-la-app";
import { marcarVistaGerencia } from "@/lib/acciones/revision-gerencia";

/**
 * «Ver PDF» de un borrador de postventa en Aprobaciones. Abrirlo es lo que
 * cuenta como «el ingeniero lo vio» (0392): se anota y postventa recibe el
 * aviso la primera vez.
 */
export function VerBorradorGerencia({ cotizacionId, cliente }: { cotizacionId: string; cliente: string }) {
  return (
    <VerPdfEnLaApp
      url={`/api/cotizaciones/${cotizacionId}/pdf`}
      titulo={`Borrador de ${cliente}`}
      antesDeAbrir={() => marcarVistaGerencia(cotizacionId).catch(() => undefined)}
      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
    >
      <FileDown className="size-3.5" /> Ver PDF
    </VerPdfEnLaApp>
  );
}
