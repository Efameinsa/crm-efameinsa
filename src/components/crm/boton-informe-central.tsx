"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

// Descarga el informe del día de Central en PDF, para enviarlo a gerencia
// —que es lo que Alondra venía armando a mano en Word todos los días.
//
// Misma mecánica que el reporte del comercial: la pestaña se abre ANTES del
// await, porque si se abriera después el navegador la bloquearía por no venir
// de un gesto directo del usuario.
export function BotonInformeCentral({ fecha }: { fecha: string }) {
  const [generando, setGenerando] = useState(false);

  function abrir() {
    setGenerando(true);
    window.open(`/api/reportes/central?fecha=${fecha}`, "_blank", "noopener");
    setTimeout(() => setGenerando(false), 2500);
  }

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={generando}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
    >
      {generando ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
      Descargar PDF
    </button>
  );
}
