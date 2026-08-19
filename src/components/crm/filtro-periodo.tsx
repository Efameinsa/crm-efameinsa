"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ETIQUETA_PRESET, periodoPreset, type PresetPeriodo } from "@/lib/periodo";
import { SelectorFecha } from "@/components/crm/selector-fecha";
import { cn } from "@/lib/utils";

// Un solo filtro para todos los paneles de gerencia. Cambia los searchParams
// de la ruta actual con router.push dentro de una transición: la página
// vieja sigue visible (con un indicador de carga) mientras llega la nueva —
// sin recarga completa del navegador, sin pantalla en blanco.
//
// Los inputs de fecha aplican solos al cambiar (cuando el rango es válido):
// no hay botón "Ir" que haya que buscar.

interface OpcionComercial {
  id: string;
  nombre: string;
}

interface Props {
  desde: string;
  hasta: string;
  presetActivo: PresetPeriodo | null;
  presets?: PresetPeriodo[];
  // Filtro por comercial (solo gerencia). undefined = no mostrar el select.
  comerciales?: OpcionComercial[];
  comercialId?: string | null;
  // Interruptor "incluir histórico Excel". undefined = no mostrar.
  incluirHistorico?: boolean;
  // Cualquier otro searchParam que deba preservarse (ej. plataforma en marketing).
  extra?: React.ReactNode;
}

const PRESETS_DEFECTO: PresetPeriodo[] = ["mes", "mes_anterior", "30d", "anio", "12m", "todo"];

export function FiltroPeriodo({
  desde,
  hasta,
  presetActivo,
  presets = PRESETS_DEFECTO,
  comerciales,
  comercialId,
  incluirHistorico,
  extra,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);

  // Si el rango cambia por navegación (preset), sincronizar los inputs.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setD(desde);
    setH(hasta);
  }, [desde, hasta]);

  function navegar(cambios: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    params.delete("pagina"); // cualquier cambio de filtro vuelve a la página 1
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function aplicarPreset(p: PresetPeriodo) {
    const r = periodoPreset(p);
    navegar({ desde: r.desde, hasta: r.hasta });
  }

  function aplicarRango(nd: string, nh: string) {
    setD(nd);
    setH(nh);
    if (/^\d{4}-\d{2}-\d{2}$/.test(nd) && /^\d{4}-\d{2}-\d{2}$/.test(nh) && nd <= nh) {
      navegar({ desde: nd, hasta: nh });
    }
  }

  return (
    <div className="relative rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => aplicarPreset(p)}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
                presetActivo === p
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {ETIQUETA_PRESET[p]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SelectorFecha valor={d} onCambiar={(f) => f && aplicarRango(f, h)} max={h} permitirQuitar={false} compacto etiquetaVacia="Desde" />
            <span>a</span>
            <SelectorFecha valor={h} onCambiar={(f) => f && aplicarRango(d, f)} min={d} permitirQuitar={false} compacto etiquetaVacia="Hasta" />
          </span>

          {comerciales && (
            <select
              value={comercialId ?? ""}
              onChange={(e) => navegar({ comercial: e.target.value || null })}
              className="h-8 cursor-pointer rounded-md border border-input bg-background px-2 text-xs text-foreground"
              aria-label="Comercial"
            >
              <option value="">Todos los comerciales</option>
              {comerciales.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}

          {incluirHistorico !== undefined && (
            <label
              className="flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-md border border-input px-2 text-xs text-muted-foreground hover:bg-accent"
              title="Las ventas anteriores al CRM se importaron de las hojas Excel de cada comercial. Apague esto para ver solo lo registrado en el sistema."
            >
              <input
                type="checkbox"
                checked={incluirHistorico}
                onChange={(e) => navegar({ historico: e.target.checked ? null : "no" })}
                className="size-3.5 cursor-pointer accent-primary"
              />
              Incluir histórico Excel
            </label>
          )}

          {extra}
        </div>
      </div>

      {pendiente && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-end rounded-xl bg-card/60 pr-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
            <Loader2 className="size-3.5 animate-spin" /> Actualizando…
          </span>
        </div>
      )}
    </div>
  );
}
