"use client";

import { useState } from "react";
import { toast } from "sonner";
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
  elegirFecha = false,
}: {
  fecha: string;
  /**
   * REPORTES POR DÍA (12-10, gerencia revisando a postventa): un selector de
   * fecha al lado para abrir el reporte de cualquier día pasado. `fecha` es
   * hoy y es el tope. Abrir un día pasado no pisa el que ya se grabó.
   */
  elegirFecha?: boolean;
  /** Sin esto, el servidor devuelve el del usuario en sesión. */
  comercialId?: string;
  etiqueta?: string;
  compacto?: boolean;
}) {
  const [generando, setGenerando] = useState(false);
  const [dia, setDia] = useState(fecha);

  function abrir() {
    const params = new URLSearchParams({ fecha: elegirFecha && dia ? dia : fecha });
    if (comercialId) params.set("comercial", comercialId);
    setGenerando(true);
    const url = `/api/reportes/diario?${params.toString()}`;
    // SI EL NAVEGADOR BLOQUEA LA PESTAÑA, window.open devuelve null y no pasa
    // NADA visible: ni ventana, ni descarga, ni error. El informe de UX del
    // 08-09 lo reportó como «no produjo nada al primer ni al segundo clic».
    // Un botón que genera un documento tiene que decir qué pasó.
    // SIN «noopener» EN LAS OPCIONES: con él, window.open devuelve SIEMPRE
    // null aunque la pestaña se abra, y este aviso salía en cada clic
    // (Santos, 14-10, en comercial4 / la app instalada). Se corta el
    // vínculo a mano después de comprobar que abrió.
    const ventana = window.open(url, "_blank");
    if (!ventana) {
      setGenerando(false);
      toast.error("El navegador bloqueó la ventana del reporte. Permita las ventanas emergentes de este sitio.");
      return;
    }
    ventana.opener = null;
    toast.success("Generando el reporte del día…");
    // El PDF se arma en el servidor; no hay evento de "listo" en la pestaña
    // nueva, así que se libera el botón tras un momento razonable.
    setTimeout(() => setGenerando(false), 2500);
  }

  const boton = (
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
  if (!elegirFecha) return boton;
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="date"
        aria-label="Día del reporte"
        title="Elija el día: hoy o cualquier día anterior"
        value={dia}
        max={fecha}
        onChange={(ev) => setDia(ev.target.value)}
        className={cn(
          "rounded-lg border border-border bg-background font-semibold text-foreground",
          compacto ? "px-1.5 py-1 text-[11px]" : "px-2 py-1.5 text-xs",
        )}
      />
      {boton}
    </span>
  );
}
