"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Botón de cierre del día: genera el PDF y lo abre en una pestaña, listo para
// descargar o adjuntar al correo — el flujo que pidió gerencia ("al final del
// día simplemente genero un reporte en PDF, lo bajo y lo envío por correo").
//
// Se abre la pestaña ANTES del await: si se abriera después, el navegador la
// bloquearía por no venir de un gesto directo del usuario.
export function BotonReporteDiario({
  fecha,
  comercialId,
  etiqueta = "Reporte del día",
  compacto = false,
}: {
  fecha: string;
  /** Sin esto, el servidor devuelve el del usuario en sesión. */
  comercialId?: string;
  etiqueta?: string;
  compacto?: boolean;
}) {
  const [generando, setGenerando] = useState(false);

  function abrir() {
    const params = new URLSearchParams({ fecha });
    if (comercialId) params.set("comercial", comercialId);
    setGenerando(true);
    window.open(`/api/reportes/diario?${params.toString()}`, "_blank", "noopener");
    // El PDF se arma en el servidor; no hay evento de "listo" en la pestaña
    // nueva, así que se libera el botón tras un momento razonable.
    setTimeout(() => setGenerando(false), 2500);
  }

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={generando}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-wait disabled:opacity-60",
        compacto ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
      )}
      title="Genera el PDF con la gestión del día para descargarlo o enviarlo por correo"
    >
      {generando ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
      {etiqueta}
    </button>
  );
}
