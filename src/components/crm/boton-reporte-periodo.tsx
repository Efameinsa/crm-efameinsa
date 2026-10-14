"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarRange, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { periodoPreset } from "@/lib/periodo";

/**
 * El reporte POR FECHAS en PDF (buzón, Gabriela PV2, 12-10, con gerencia:
 * «solamente tiene para generar reportes del día, más no para filtrar de un
 * día a otro día, o de un mes»). Atajos para lo de siempre —hoy, ayer, esta
 * semana, la pasada, este mes, el pasado— y «Otras fechas» con desde y hasta.
 *
 * La pestaña se abre ANTES de cualquier espera para que el navegador no la
 * bloquee, igual que los otros reportes.
 */
type Atajo = "hoy" | "ayer" | "semana" | "semana_anterior" | "mes" | "mes_anterior" | "otras";

const ATAJOS: { valor: Atajo; texto: string }[] = [
  { valor: "semana", texto: "Esta semana" },
  { valor: "semana_anterior", texto: "Semana pasada" },
  { valor: "mes", texto: "Este mes" },
  { valor: "mes_anterior", texto: "Mes pasado" },
  { valor: "hoy", texto: "Hoy" },
  { valor: "ayer", texto: "Ayer" },
  { valor: "otras", texto: "De una fecha a otra" },
];

function restarDia(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function rangoDe(atajo: Atajo, hoy: string): { desde: string; hasta: string } {
  if (atajo === "hoy") return { desde: hoy, hasta: hoy };
  if (atajo === "ayer") return { desde: restarDia(hoy), hasta: restarDia(hoy) };
  if (atajo === "otras") return { desde: hoy, hasta: hoy };
    const p = periodoPreset(atajo, hoy);
  // La semana pasada llega hasta el domingo; el reporte no pasa de hoy.
  return { desde: p.desde, hasta: p.hasta > hoy ? hoy : p.hasta };
}

export function BotonReportePeriodo({
  hoy,
  comercialId,
  etiqueta = "Reporte por fechas",
  compacto = false,
}: {
  /** Hoy en Lima (YYYY-MM-DD). */
  hoy: string;
  /** Sin esto, el servidor devuelve el del usuario en sesión. */
  comercialId?: string;
  etiqueta?: string;
  compacto?: boolean;
}) {
  const [atajo, setAtajo] = useState<Atajo>("semana");
  const [desde, setDesde] = useState(() => rangoDe("semana", hoy).desde);
  const [hasta, setHasta] = useState(hoy);
  const [generando, setGenerando] = useState(false);

  function elegir(a: Atajo) {
    setAtajo(a);
    // «Otras fechas» deja las fechas como están para cambiarlas a mano.
    if (a !== "otras") {
      const r = rangoDe(a, hoy);
      setDesde(r.desde);
      setHasta(r.hasta);
    }
  }

  function abrir() {
    if (!desde || !hasta) {
      toast.error("Elija desde qué día y hasta qué día.");
      return;
    }
    const params = new URLSearchParams({ desde, hasta });
    if (comercialId) params.set("comercial", comercialId);
    setGenerando(true);
    // SIN «noopener» EN LAS OPCIONES: con él, window.open devuelve SIEMPRE
    // null aunque la pestaña se abra, y este aviso salía en cada clic
    // (Santos, 14-10, en comercial4 / la app instalada). Se corta el
    // vínculo a mano después de comprobar que abrió.
    const ventana = window.open(`/api/reportes/periodo?${params.toString()}`, "_blank");
    if (!ventana) {
      setGenerando(false);
      toast.error("El navegador bloqueó la ventana del reporte. Permita las ventanas emergentes de este sitio.");
      return;
    }
    ventana.opener = null;
    toast.success("Generando el reporte…");
    setTimeout(() => setGenerando(false), 2500);
  }

  const control = cn(
    "rounded-lg border border-border bg-background font-semibold text-foreground transition-colors hover:bg-accent",
    compacto ? "px-1.5 py-1 text-[11px]" : "px-2 py-1.5 text-xs",
  );

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <label className="sr-only" htmlFor="periodo-reporte">
        Fechas del reporte
      </label>
      <select
        id="periodo-reporte"
        value={atajo}
        onChange={(ev) => elegir(ev.target.value as Atajo)}
        className={cn(control, "cursor-pointer")}
        title="Qué fechas van a salir en el reporte"
      >
        {ATAJOS.map((a) => (
          <option key={a.valor} value={a.valor}>
            {a.texto}
          </option>
        ))}
      </select>
      {/* Las dos fechas siempre a la vista (reunión 13-10, Rubí: «ayer me salía de
          tal fecha a tal fecha y ya no lo tengo»). Antes solo aparecían con
          «Otras fechas…» y volvían a esconderse al elegir un atajo. Cambiar una
          fecha a mano pasa el atajo a «Otras fechas». */}
      <input
        type="date"
        aria-label="Desde"
        value={desde}
        max={hoy}
        onChange={(ev) => {
          setDesde(ev.target.value);
          setAtajo("otras");
        }}
        className={control}
        title="Desde qué día"
      />
      <span className="text-[11px] text-muted-foreground">al</span>
      <input
        type="date"
        aria-label="Hasta"
        value={hasta}
        min={desde}
        max={hoy}
        onChange={(ev) => {
          setHasta(ev.target.value);
          setAtajo("otras");
        }}
        className={control}
        title="Hasta qué día"
      />
      <button
        type="button"
        onClick={abrir}
        disabled={generando}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-60",
          compacto ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        )}
        title="Seguimientos, presupuestos, ventas cerradas, actividades y pendientes de las fechas elegidas (hasta 3 meses)"
      >
        {generando ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarRange className="size-3.5" />}
        {etiqueta}
      </button>
    </span>
  );
}
