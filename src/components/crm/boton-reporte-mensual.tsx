"use client";

import { useState } from "react";
import { CalendarRange, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { rotuloMes, sumarMes } from "@/lib/calendario";

/**
 * El reporte del mes en PDF (ing. Carlos, 31-08: «que los comerciales también
 * puedan descargar su reporte mensual»).
 *
 * Va pegado al reporte del día y al cierre de la semana porque son el mismo
 * hábito a tres escalas, y se abre igual que ellos: una pestaña nueva con el
 * PDF, listo para bajar o adjuntar al correo.
 *
 * POR QUÉ HAY UN SELECTOR DE MES y no solo un botón: el mes se cierra cuando
 * ya terminó. Quien entra el 2 de septiembre quiere agosto, y quien entra el
 * 20 quiere septiembre — eso lo decide `mesPorDefecto()` en el servidor y acá
 * se ofrece el mismo criterio, más los once meses anteriores por si hay que
 * volver a sacar uno.
 *
 * La pestaña se abre ANTES del await: si se abriera después, el navegador la
 * bloquearía por no venir de un gesto directo del usuario.
 */
export function BotonReporteMensual({
  mes,
  comercialId,
  etiqueta = "Reporte del mes",
  compacto = false,
  cuantosMeses = 12,
}: {
  /** Mes propuesto («2026-08»). Sin esto, el servidor elige el que corresponde. */
  mes: string;
  /** Sin esto, el servidor devuelve el del usuario en sesión. */
  comercialId?: string;
  etiqueta?: string;
  compacto?: boolean;
  cuantosMeses?: number;
}) {
  const [elegido, setElegido] = useState(mes);
  const [generando, setGenerando] = useState(false);

  const meses = Array.from({ length: cuantosMeses }, (_, i) => sumarMes(mes, -i));

  function abrir() {
    const params = new URLSearchParams({ mes: elegido });
    if (comercialId) params.set("comercial", comercialId);
    setGenerando(true);
    window.open(`/api/reportes/mensual?${params.toString()}`, "_blank", "noopener");
    // El PDF se arma en el servidor y la pestaña nueva no avisa cuando está
    // lista; el botón se libera tras un momento razonable.
    setTimeout(() => setGenerando(false), 2500);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <label className="sr-only" htmlFor="mes-reporte">
        Mes del reporte
      </label>
      <select
        id="mes-reporte"
        value={elegido}
        onChange={(ev) => setElegido(ev.target.value)}
        className={cn(
          "cursor-pointer rounded-lg border border-border bg-background font-semibold text-foreground transition-colors hover:bg-accent",
          compacto ? "px-1.5 py-1 text-[11px]" : "px-2 py-1.5 text-xs",
        )}
        title="Mes que va a salir en el reporte"
      >
        {meses.map((m) => (
          <option key={m} value={m}>
            {rotuloMes(m)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={abrir}
        disabled={generando}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-60",
          compacto ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        )}
        title="Cómo cerró el mes: gestiones, cotizaciones, ventas contra la meta y lo que queda abierto"
      >
        {generando ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarRange className="size-3.5" />}
        {etiqueta}
      </button>
    </span>
  );
}
