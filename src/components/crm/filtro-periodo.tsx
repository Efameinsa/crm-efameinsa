"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { ETIQUETA_PRESET, hoyLima, periodoPreset, type Periodo, type PresetPeriodo } from "@/lib/periodo";
import { lunesDe, rotuloDia, rotuloMes, rotuloSemana, sumarDias, sumarMes } from "@/lib/calendario";
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
  // Escalas día / semana / mes / año con «anterior» y «siguiente». undefined =
  // no mostrar (los paneles de gerencia siguen con sus presets). Ver abajo.
  escalas?: boolean;
}

/**
 * ESCALAS: día, semana, mes y año, y las flechas para ir al anterior o al
 * siguiente.
 *
 * Pedido del ing. Carlos para el listado de presupuestos de Central (E1 de
 * docs/22, reuniones del 31-08 y 01-09): «filtros por día, semana, mes y
 * año». Los presets de gerencia («esta semana», «mes anterior», «últimos 30
 * días») responden a otra pregunta —¿cómo va el período en curso?—; Central
 * necesita recorrer el calendario: ¿qué se envió el martes?, ¿y en julio?
 *
 * Es el MISMO filtro, no otro: las escalas solo cambian desde/hasta en la URL,
 * igual que un preset o que los dos selectores de fecha, así que la página
 * que lo usa no distingue de dónde salió el rango. Con eso, «ir al mes
 * anterior» desde un rango cualquiera funciona y el enlace sigue siendo
 * compartible.
 */
export type EscalaPeriodo = "dia" | "semana" | "mes" | "anio";

export const ETIQUETA_ESCALA: Record<EscalaPeriodo, string> = {
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
  anio: "Año",
};

const ORDEN_ESCALAS: EscalaPeriodo[] = ["dia", "semana", "mes", "anio"];

/** El rango COMPLETO de la escala en la que cae `ancla` (un día de calendario). */
export function rangoDeEscala(escala: EscalaPeriodo, ancla: string): Periodo {
  switch (escala) {
    case "dia":
      return { desde: ancla, hasta: ancla };
    case "semana": {
      const lunes = lunesDe(ancla);
      return { desde: lunes, hasta: sumarDias(lunes, 6) };
    }
    case "mes": {
      const mes = ancla.slice(0, 7);
      return { desde: `${mes}-01`, hasta: sumarDias(`${sumarMes(mes, 1)}-01`, -1) };
    }
    case "anio": {
      const anio = ancla.slice(0, 4);
      return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
    }
  }
}

/**
 * Qué escala tiene un rango, si es alguna de las cuatro. Reconoce tanto el
 * período completo (lunes a domingo) como el que está en curso y corta en hoy
 * (lunes a hoy), que es como lo dejan los presets de `periodo.ts`.
 */
export function escalaDelRango(desde: string, hasta: string, hoy = hoyLima()): EscalaPeriodo | null {
  if (desde === hasta) return "dia";
  for (const escala of ORDEN_ESCALAS) {
    if (escala === "dia") continue;
    const r = rangoDeEscala(escala, desde);
    if (r.desde !== desde) continue;
    if (hasta === r.hasta) return escala;
    if (hasta === hoy && hoy >= r.desde && hoy <= r.hasta) return escala;
  }
  return null;
}

/**
 * El período anterior (-1) o siguiente (+1) en la misma escala. Un período que
 * incluye hoy corta en hoy, para que coincida con el preset equivalente y no
 * se pidan días que todavía no pasaron.
 */
export function desplazarRango(escala: EscalaPeriodo, desde: string, delta: -1 | 1, hoy = hoyLima()): Periodo {
  let ancla: string;
  switch (escala) {
    case "dia":
      ancla = sumarDias(desde, delta);
      break;
    case "semana":
      ancla = sumarDias(lunesDe(desde), 7 * delta);
      break;
    case "mes":
      ancla = `${sumarMes(desde.slice(0, 7), delta)}-01`;
      break;
    case "anio":
      ancla = `${Number(desde.slice(0, 4)) + delta}-01-01`;
      break;
  }
  return recortarEnHoy(rangoDeEscala(escala, ancla), hoy);
}

function recortarEnHoy(r: Periodo, hoy: string): Periodo {
  return r.desde <= hoy && r.hasta > hoy ? { desde: r.desde, hasta: hoy } : r;
}

/** «1 de septiembre de 2026», «Semana del 24 al 30 de agosto», «agosto 2026», «2026». */
export function rotuloDeEscala(escala: EscalaPeriodo, desde: string): string {
  switch (escala) {
    case "dia":
      return `${rotuloDia(desde)} de ${desde.slice(0, 4)}`;
    case "semana":
      return rotuloSemana(lunesDe(desde), 7);
    case "mes":
      return rotuloMes(desde.slice(0, 7));
    case "anio":
      return desde.slice(0, 4);
  }
}

const PRESETS_DEFECTO: PresetPeriodo[] = ["semana", "semana_anterior", "mes", "mes_anterior", "30d", "anio", "12m", "todo"];

export function FiltroPeriodo({
  desde,
  hasta,
  presetActivo,
  presets = PRESETS_DEFECTO,
  comerciales,
  comercialId,
  incluirHistorico,
  extra,
  escalas,
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

  // Escalas: la activa se deduce del rango, no se guarda aparte. Al elegir una
  // escala se toma como ancla hoy si el rango actual lo incluye, y si no el
  // primer día del rango: «mes» desde la semana pasada da ese mes, no este.
  const hoy = hoyLima();
  const escalaActiva = escalas ? escalaDelRango(desde, hasta, hoy) : null;
  const rangoSiguiente = escalaActiva ? desplazarRango(escalaActiva, desde, 1, hoy) : null;

  function aplicarEscala(e: EscalaPeriodo) {
    const ancla = desde <= hoy && hoy <= hasta ? hoy : desde;
    const r = recortarEnHoy(rangoDeEscala(e, ancla), hoy);
    navegar({ desde: r.desde, hasta: r.hasta });
  }

  function desplazar(delta: -1 | 1) {
    if (!escalaActiva) return;
    const r = desplazarRango(escalaActiva, desde, delta, hoy);
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
        {escalas && (
          <div className="flex flex-wrap items-center gap-1.5">
            {ORDEN_ESCALAS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => aplicarEscala(e)}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
                  escalaActiva === e
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {ETIQUETA_ESCALA[e]}
              </button>
            ))}
            {/* Las flechas solo tienen sentido cuando el rango ES un día, una
                semana, un mes o un año; con un rango a mano no hay «anterior». */}
            {escalaActiva && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-foreground">
                <button
                  type="button"
                  onClick={() => desplazar(-1)}
                  className="cursor-pointer rounded-md border border-border p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={`${ETIQUETA_ESCALA[escalaActiva]} anterior`}
                  title={`${ETIQUETA_ESCALA[escalaActiva]} anterior`}
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="min-w-[8rem] px-1 text-center font-medium">
                  {rotuloDeEscala(escalaActiva, desde)}
                </span>
                <button
                  type="button"
                  onClick={() => desplazar(1)}
                  disabled={!rangoSiguiente || rangoSiguiente.desde > hoy}
                  className="cursor-pointer rounded-md border border-border p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`${ETIQUETA_ESCALA[escalaActiva]} siguiente`}
                  title={`${ETIQUETA_ESCALA[escalaActiva]} siguiente`}
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </span>
            )}
          </div>
        )}

        {presets.length > 0 && (
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
        )}

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
