"use client";

import { useMemo, useState } from "react";
import { FilaRutaMantenimiento } from "@/components/crm/fila-ruta";
import { FiltrosRuta, type ValoresFiltroRuta } from "@/components/crm/filtros-ruta";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import {
  columnaDe,
  filtrarRuta,
  ordenarRuta,
  tieneTelefono,
  ETIQUETA_COLUMNA,
  PESTANAS_RUTA as PESTANAS,
  type ColumnaRuta,
  type FilaRuta,
} from "@/lib/ruta-mantenimiento";
import { cn } from "@/lib/utils";

/**
 * La ruta de mantenimiento, con las pestañas y los filtros EN EL NAVEGADOR.
 *
 * Misma razón que lista-parque.tsx (Santos, 11-09): cada cambio de pestaña,
 * tanda o búsqueda era una vuelta al servidor que rearmaba las 500 filas, sin
 * ningún «cargando» porque era la misma pantalla. Las filas ya vienen enteras
 * del servidor (ruta-mantenimiento-vista.tsx); acá se cortan al instante.
 *
 * `filtrarRuta`, `ordenarRuta` y `columnaDe` son las mismas funciones puras de
 * siempre —con sus pruebas— llamadas desde el otro lado: no se reescribió
 * ninguna regla.
 */


/** Cuántas filas se pintan por tanda: la campaña se trabaja de a diez llamadas. */
const POR_TANDA = 40;

export function ListaRuta({
  filas,
  hoy,
  hrefBase,
  inicial,
}: {
  filas: FilaRuta[];
  hoy: string;
  /** La URL de la pantalla que la muestra: `/comercial/ruta` o `/comercial/oportunidades?modo=ruta`. */
  hrefBase: string;
  inicial: { ver: ColumnaRuta } & ValoresFiltroRuta;
}) {
  const [pestana, setPestana] = useState<ColumnaRuta>(inicial.ver);
  const [valores, setValores] = useState<ValoresFiltroRuta>({
    q: inicial.q,
    mant: inicial.mant,
    compra: inicial.compra,
    llamada: inicial.llamada,
    tel: inicial.tel,
  });
  const [visibles, setVisibles] = useState(POR_TANDA);

  function sincronizarUrl(ver: ColumnaRuta, v: ValoresFiltroRuta) {
    const [base, cola] = hrefBase.split("?");
    const p = new URLSearchParams(cola ?? "");
    p.set("ver", ver);
    if (v.q) p.set("q", v.q); else p.delete("q");
    for (const k of ["mant", "compra", "llamada", "tel"] as const) {
      if (v[k]) p.set(k, v[k] as string); else p.delete(k);
    }
    window.history.replaceState(null, "", `${base}?${p.toString()}`);
    setVisibles(POR_TANDA);
  }

  function cambiarFiltros(cambios: Partial<ValoresFiltroRuta>) {
    const nuevos = { ...valores, ...cambios };
    setValores(nuevos);
    sincronizarUrl(pestana, nuevos);
  }
  function cambiarPestana(ver: ColumnaRuta) {
    setPestana(ver);
    sincronizarUrl(ver, valores);
  }

  const filtros = { ...valores, q: valores.q || null };
  // Los conteos de las pestañas respetan los filtros: si se armó la tanda «los
  // que nunca se hicieron mantenimiento», lo que interesa saber es cuántos de
  // ESOS quedan por llamar y cuántos ya cerraron.
  const porColumna = useMemo(() => {
    const m = new Map<ColumnaRuta, FilaRuta[]>(PESTANAS.map((p) => [p, []]));
    for (const f of filas) m.get(columnaDe(f, hoy))!.push(f);
    return m;
  }, [filas, hoy]);
  const cuenta = (c: ColumnaRuta) => filtrarRuta(porColumna.get(c) ?? [], hoy, filtros).length;

  const enPestana = porColumna.get(pestana) ?? [];
  // Cuántos de esta pestaña no se pueden llamar, contados con la tanda puesta
  // pero sin el propio recorte del teléfono.
  const sinTelefono = filtrarRuta(enPestana, hoy, { ...filtros, tel: null }).filter((f) => !tieneTelefono(f)).length;
  const lista = useMemo(() => ordenarRuta(filtrarRuta(enPestana, hoy, filtros), hoy), [enPestana, hoy, filtros.q, filtros.mant, filtros.compra, filtros.llamada, filtros.tel]); // eslint-disable-line react-hooks/exhaustive-deps
  const mostradas = lista.slice(0, visibles);
  const cerrada = pestana === "cerrados" || pestana === "cotizados";
  const hayFiltro = Boolean(valores.q || valores.mant || valores.compra || valores.llamada || valores.tel);

  return (
    <SeccionPanel
      titulo="Ruta de mantenimiento"
      accion={
        <div className="flex flex-wrap items-center gap-1.5">
          {PESTANAS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => cambiarPestana(p)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                pestana === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {ETIQUETA_COLUMNA[p]}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums",
                  pestana === p ? "bg-primary-foreground/20" : "bg-background/70 text-foreground",
                )}
              >
                {cuenta(p)}
              </span>
            </button>
          ))}
        </div>
      }
    >
      <p className="mb-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
        Clientes de la base instalada a los que hay que ofrecerles el mantenimiento. Arriba, lo que nunca se llamó y
        lo más atrasado; después, lo que lleva más tiempo sin mantenimiento. La cuenta sigue siendo del comercial que
        la vendió: acá está la oportunidad de mantenimiento, no el cliente.
      </p>

      <FiltrosRuta
        valores={valores}
        onCambiar={cambiarFiltros}
        sinTelefono={sinTelefono}
        visibles={lista.length}
        total={enPestana.length}
      />

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {hayFiltro
              ? "Ningún cliente de esta pestaña cumple con lo que se pidió."
              : pestana === "por_llamar"
                ? "No queda nadie por llamar hoy. Los recontactos programados están en «Llamados»."
                : "Todavía no hay nada acá."}
          </p>
          {hayFiltro && (
            <button
              type="button"
              onClick={() => cambiarFiltros({ q: "", mant: null, compra: null, llamada: null, tel: null })}
              className="mt-2 inline-block cursor-pointer text-sm font-semibold text-primary hover:underline"
            >
              Quitar los filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {mostradas.map((f) => (
            <FilaRutaMantenimiento key={f.id} fila={f} hoy={hoy} cerrada={cerrada} />
          ))}
          {mostradas.length < lista.length && (
            // De a tandas, nunca todo de golpe: es lo que trabó la aplicación
            // instalada en «Las ventas de la empresa».
            <button
              type="button"
              onClick={() => setVisibles((v) => v + POR_TANDA)}
              className="block w-full cursor-pointer rounded-lg border border-dashed border-border p-3 text-center text-sm font-semibold text-primary hover:bg-accent"
            >
              Ver {Math.min(POR_TANDA, lista.length - mostradas.length)} más ({lista.length - mostradas.length} restantes)
            </button>
          )}
        </div>
      )}
    </SeccionPanel>
  );
}
