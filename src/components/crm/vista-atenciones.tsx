"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { fechaHoraLima } from "@/lib/fechas";
import {
  ETAPAS_ATENCION,
  ETIQUETA_ETAPA,
  ETIQUETA_TIPO_ATENCION,
  ETIQUETA_CLASIFICACION,
  COLOR_CLASIFICACION,
  pasoDe,
  queLeFalta,
  relojAtencion,
  type Atencion,
} from "@/lib/atenciones";
import { cn } from "@/lib/utils";

/**
 * La pista de nueve etapas (embudo + lista), con los filtros EN EL NAVEGADOR.
 *
 * Misma razón que lista-parque.tsx (Santos, 11-09): los chips de filtro y de
 * etapa eran enlaces que volvían al servidor a releer las 300 atenciones por
 * un corte que cabe en memoria. Las filas ya vienen enteras de la página; acá
 * se cortan al instante. Reutilizada tanto para «Abiertas» como para
 * «Cerradas».
 */

export type FilaAtencion = Atencion & {
  cuentas: { razon_social: string } | null;
  perfiles: { nombre: string; codigo_comercial: string | null } | null;
  tomadaPor?: { nombre: string; codigo_comercial: string | null } | null;
};

const FILTROS = [
  { clave: "", etiqueta: "Todas" },
  // «Lista sin atender y lista de atendidos» (la señorita de postventa,
  // 01-09): atendida es que alguien ya hizo algo con ella (`tomada_at`, 0146).
  { clave: "sin_atender", etiqueta: "Sin atender" },
  { clave: "atendidas", etiqueta: "Atendidas" },
  { clave: "urgentes", etiqueta: "Se pasaron de tiempo" },
  { clave: "sin_programar", etiqueta: "Sin programar" },
] as const;

export function VistaAtenciones({
  todas,
  cerradas,
  inicial,
}: {
  todas: FilaAtencion[];
  cerradas: boolean;
  inicial: { filtro: string; etapa: string | null };
}) {
  const [filtro, setFiltro] = useState(inicial.filtro);
  const [etapa, setEtapa] = useState<string | null>(inicial.etapa);

  function sincronizarUrl(f: string, e: string | null) {
    const p = new URLSearchParams();
    if (cerradas) p.set("ver", "cerradas");
    if (f) p.set("filtro", f);
    if (e) p.set("etapa", e);
    const s = p.toString();
    window.history.replaceState(null, "", `/postventa/atenciones${s ? `?${s}` : ""}`);
  }

  const filas = useMemo(() => {
    let f = todas;
    if (!cerradas) {
      if (filtro === "urgentes") f = f.filter((a) => relojAtencion(a).estado === "rojo");
      if (filtro === "sin_programar") f = f.filter((a) => !a.programada_at);
      if (filtro === "sin_atender") f = f.filter((a) => !a.tomada_at);
      if (filtro === "atendidas") f = f.filter((a) => a.tomada_at);
    }
    if (etapa) f = f.filter((a) => a.etapa === etapa);
    return f;
  }, [todas, cerradas, filtro, etapa]);

  return (
    <div>
      {!cerradas && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.clave || "todas"}
              type="button"
              onClick={() => { setFiltro(f.clave); sincronizarUrl(f.clave, etapa); }}
              className={cn(
                "cursor-pointer rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
                filtro === f.clave ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      )}

      {/* El embudo de las nueve etapas, clicable: dice de un vistazo dónde se
          está atascando el trabajo. Solo las etapas que tienen algo (informe
          de UX del 08-09); la seleccionada se queda aunque quede vacía. */}
      {!cerradas && (
        <div className="mb-3 flex flex-wrap gap-1">
          {ETAPAS_ATENCION.filter((e) => todas.some((a) => a.etapa === e) || etapa === e).map((e) => {
            const n = todas.filter((a) => a.etapa === e).length;
            return (
              <button
                key={e}
                type="button"
                onClick={() => { const nueva = etapa === e ? null : e; setEtapa(nueva); sincronizarUrl(filtro, nueva); }}
                className={cn(
                  "cursor-pointer rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  etapa === e ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  n === 0 && "opacity-45",
                )}
              >
                {ETIQUETA_ETAPA[e]} <b className="tabular-nums">{n}</b>
              </button>
            );
          })}
        </div>
      )}

      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {cerradas
            ? "Todavía no hay atenciones cerradas."
            : "No hay atenciones acá. Las que registre el área o derive Central aparecen en esta lista."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {filas.map((a) => {
            const falta = queLeFalta(a);
            const reloj = relojAtencion(a);
            return (
              <Link
                key={a.id}
                href={`/postventa/atenciones/${a.id}`}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2.5 transition-colors hover:bg-accent",
                  reloj.estado === "rojo" && !a.cerrado_at ? "border-destructive/40 bg-destructive/5" : "border-border",
                  a.cerrado_at && "opacity-70",
                )}
              >
                <span className="w-24 flex-none text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {ETIQUETA_ETAPA[a.etapa]}
                  <span className="ml-1 font-normal tabular-nums opacity-70">{pasoDe(a.etapa) + 1}/9</span>
                </span>
                <span className="min-w-[180px] flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {ETIQUETA_TIPO_ATENCION[a.tipo]}
                    {a.detalle ? ` · ${a.detalle}` : ""}
                  </span>
                </span>
                {a.clasificacion && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", COLOR_CLASIFICACION[a.clasificacion])}>
                    {ETIQUETA_CLASIFICACION[a.clasificacion]}
                  </span>
                )}
                {a.programada_at && !a.cerrado_at && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {fechaHoraLima(a.programada_at)}
                    {a.tecnico && ` · ${a.tecnico}`}
                  </span>
                )}
                {!a.cerrado_at && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      falta.urgente || reloj.estado === "rojo" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {(falta.urgente || reloj.estado === "rojo") && <AlertTriangle className="size-3" />}
                    {falta.texto}
                  </span>
                )}
                <span className="w-28 flex-none text-right text-[11px] text-muted-foreground">
                  {a.tomada_at
                    ? `atendida ${fechaHoraLima(a.tomada_at)}${a.tomadaPor ? ` · ${a.tomadaPor.codigo_comercial ?? a.tomadaPor.nombre}` : ""}`
                    : (a.perfiles?.codigo_comercial ?? a.perfiles?.nombre ?? "sin atender")}
                </span>
                <ChevronRight className="size-3.5 flex-none text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
