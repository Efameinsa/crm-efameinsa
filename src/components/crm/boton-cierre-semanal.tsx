"use client";

import { useState } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * El cierre de la semana en PDF (ing. Carlos, 27-08): lo proyectado contra lo
 * vendido. Mismo gesto que el reporte diario —se abre en una pestaña, listo
 * para bajar o adjuntar al correo— porque son dos documentos de la misma
 * familia y van por el mismo camino.
 *
 * La pestaña se abre ANTES del await: si se abriera después, el navegador la
 * bloquearía por no venir de un gesto directo del usuario.
 */
export function BotonCierreSemanal({
  semana,
  comercialId,
  etiqueta = "Cierre de la semana",
  compacto = false,
}: {
  /** Lunes de la semana (YYYY-MM-DD). Sin esto, el servidor toma la actual. */
  semana?: string;
  /** Sin esto, el servidor devuelve el del usuario en sesión. */
  comercialId?: string;
  etiqueta?: string;
  compacto?: boolean;
}) {
  const [generando, setGenerando] = useState(false);

  function abrir() {
    const params = new URLSearchParams();
    if (semana) params.set("semana", semana);
    if (comercialId) params.set("comercial", comercialId);
    setGenerando(true);
    const query = params.toString();
    window.open(`/api/reportes/semanal${query ? `?${query}` : ""}`, "_blank", "noopener");
    setTimeout(() => setGenerando(false), 2500);
  }

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={generando}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-60",
        compacto ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
      )}
      title="Lo que proyectó contra lo que vendió esta semana, con lo que quedó pendiente"
    >
      {generando ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarCheck className="size-3.5" />}
      {etiqueta}
    </button>
  );
}
