"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SelectorFecha } from "@/components/crm/selector-fecha";
import { fechaCalendarioLarga } from "@/lib/fechas";

// Filtro de un solo día para /gerencia/supervision. Mismo patrón que
// FiltroPeriodo (router.push en useTransition, sin recarga completa), pero
// con un único searchParam "fecha" en vez de un rango — esta pantalla es de
// supervisión diaria, no de reporte de período.
export function FiltroFechaSupervision({ fecha, hoy }: { fecha: string; hoy: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, startTransition] = useTransition();

  function ir(nuevaFecha: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("fecha", nuevaFecha);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="relative flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      {/* max=hoy: no tiene sentido supervisar un día que aún no pasó. */}
      <SelectorFecha valor={fecha} onCambiar={(f) => f && ir(f)} max={hoy} permitirQuitar={false} />
      <span className="text-sm capitalize text-foreground">
        {new Date(`${fecha}T12:00:00`).toLocaleDateString("es-PE", { weekday: "long" })} {fechaCalendarioLarga(fecha)}
      </span>
      {fecha !== hoy && (
        <button type="button" onClick={() => ir(hoy)} className="cursor-pointer text-xs font-semibold text-primary hover:underline">
          Volver a hoy
        </button>
      )}
      {pendiente && (
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Actualizando…
        </span>
      )}
    </div>
  );
}
