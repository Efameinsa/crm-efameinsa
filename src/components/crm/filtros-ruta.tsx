"use client";

import { useEffect, useState } from "react";
import { PhoneOff, Search, X } from "lucide-react";
import {
  ETIQUETA_COMPRA,
  ETIQUETA_LLAMADA,
  ETIQUETA_MANTENIMIENTO,
  type EstadoCompra,
  type EstadoLlamada,
  type EstadoMantenimiento,
} from "@/lib/ruta-mantenimiento";
import { cn } from "@/lib/utils";

/**
 * La barra con la que se arma la tanda de llamadas del día.
 *
 * POR QUÉ EXISTE (gerencia, 29-08): «debería poder filtrarse también por último
 * mantenimiento, compró, llamada, para poder buscar por ahí oportunidades». Con
 * 249 clientes por llamar, el orden de la lista dice por dónde empezar pero no
 * deja armar una tanda —«hoy llamo a los que compraron hace más de dos años y
 * nunca se hicieron el preventivo»—, que es como se trabaja una campaña de
 * verdad: un argumento, veinte llamadas iguales.
 *
 * Los atajos de arriba no son un filtro más: son las tres tandas que ya se
 * sabe que valen, a un clic, para no obligar a nadie a componerlas con tres
 * desplegables.
 *
 * 11-09: YA NO NAVEGA. Antes cada cambio era un `router.push` y la pantalla
 * entera volvía del servidor (1–2 s por clic, sin ningún «cargando»). Ahora la
 * barra solo avisa `onCambiar` y la lista, que ya tiene todas las filas, filtra
 * al instante; la URL la mantiene al día la lista (ver lista-ruta.tsx).
 */

export interface ValoresFiltroRuta {
  q: string;
  mant: EstadoMantenimiento | null;
  compra: EstadoCompra | null;
  llamada: EstadoLlamada | null;
  tel: "sin" | "con" | null;
}

const ATAJOS: {
  clave: string;
  etiqueta: string;
  titulo: string;
  filtros: { mant?: EstadoMantenimiento; compra?: EstadoCompra; llamada?: EstadoLlamada };
}[] = [
  {
    clave: "nunca_mant",
    etiqueta: "Nunca le hicimos mantenimiento",
    titulo: "Compró y nunca volvió: la llamada tiene argumento propio",
    filtros: { mant: "nunca" },
  },
  {
    clave: "vencidos",
    etiqueta: "Mantenimiento vencido",
    titulo: "Su último preventivo fue hace 6 meses o más",
    filtros: { mant: "vencido" },
  },
  {
    clave: "antiguos",
    etiqueta: "Compró hace 2+ años y nunca se le llamó",
    titulo: "Clientes viejos que la campaña todavía no tocó",
    filtros: { compra: "mas_2a", llamada: "nunca" },
  },
];

export function FiltrosRuta({
  valores,
  onCambiar,
  sinTelefono,
  visibles,
  total,
}: {
  valores: ValoresFiltroRuta;
  onCambiar: (cambios: Partial<ValoresFiltroRuta>) => void;
  /** Cuántos clientes de esta pestaña no tienen ningún número cargado. */
  sinTelefono: number;
  /** Cuántas filas quedaron en esta pestaña con los filtros puestos. */
  visibles: number;
  /** Cuántas hay en la pestaña sin filtrar. */
  total: number;
}) {
  const { q, mant, compra, llamada, tel } = valores;
  const [texto, setTexto] = useState(q);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTexto(q);
  }, [q]);

  // La búsqueda aplica al dejar de escribir: filtrar 500 filas por tecla se
  // siente bien, pero con 500 filas pintándose a cada letra tiembla.
  useEffect(() => {
    if (texto === q) return;
    const t = setTimeout(() => onCambiar({ q: texto.trim() }), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const hayFiltro = Boolean(mant || compra || llamada || tel || q);

  function atajoActivo(a: (typeof ATAJOS)[number]) {
    return (
      (a.filtros.mant ?? null) === mant &&
      (a.filtros.compra ?? null) === compra &&
      (a.filtros.llamada ?? null) === llamada
    );
  }

  return (
    <div className="relative mb-4 rounded-xl border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar cliente, zona, serie…"
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        <Filtro
          etiqueta="Mantenimiento"
          valor={mant}
          onChange={(v) => onCambiar({ mant: v as EstadoMantenimiento | null })}
          opciones={Object.entries(ETIQUETA_MANTENIMIENTO).map(([valor, texto]) => ({ valor, texto }))}
        />
        <Filtro
          etiqueta="Compró"
          valor={compra}
          onChange={(v) => onCambiar({ compra: v as EstadoCompra | null })}
          opciones={Object.entries(ETIQUETA_COMPRA).map(([valor, texto]) => ({ valor, texto }))}
        />
        <Filtro
          etiqueta="Llamada"
          valor={llamada}
          onChange={(v) => onCambiar({ llamada: v as EstadoLlamada | null })}
          opciones={Object.entries(ETIQUETA_LLAMADA).map(([valor, texto]) => ({ valor, texto }))}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tandas</span>
        {ATAJOS.map((a) => {
          const activo = atajoActivo(a);
          return (
            <button
              key={a.clave}
              type="button"
              title={a.titulo}
              onClick={() =>
                onCambiar(
                  activo
                    ? { mant: null, compra: null, llamada: null }
                    : {
                        mant: a.filtros.mant ?? null,
                        compra: a.filtros.compra ?? null,
                        llamada: a.filtros.llamada ?? null,
                      },
                )
              }
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                activo
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {a.etiqueta}
            </button>
          );
        })}

        {/* No es una tanda más: se cruza con la que esté puesta, por eso no
            limpia los otros tres. Es el pedido de Ariana del 10-09 —«¿cómo voy
            a gestionar si no visualizo sus teléfonos? y así son varios»—. */}
        {(sinTelefono > 0 || tel) && (
          <button
            type="button"
            title="Clientes de la campaña a los que todavía no se les puede llamar: no tienen ningún número cargado. Se anota desde la misma fila."
            onClick={() => onCambiar({ tel: tel === "sin" ? null : "sin" })}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              tel === "sin"
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-500",
            )}
          >
            <PhoneOff className="mr-1 inline size-3" />
            Sin teléfono{sinTelefono > 0 && <> ({sinTelefono.toLocaleString("es-PE")})</>}
          </button>
        )}

        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            <b className="text-foreground tabular-nums">{visibles.toLocaleString("es-PE")}</b>
            {hayFiltro && <> de {total.toLocaleString("es-PE")}</>} en esta pestaña
          </span>
          {hayFiltro && (
            <button
              type="button"
              onClick={() => {
                setTexto("");
                onCambiar({ mant: null, compra: null, llamada: null, tel: null, q: "" });
              }}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 font-semibold text-foreground hover:bg-accent"
            >
              <X className="size-3" /> Quitar filtros
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function Filtro({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string;
  valor: string | null;
  opciones: { valor: string; texto: string }[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label
      className={cn(
        "flex h-10 min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border bg-background px-2.5 transition-colors",
        valor ? "border-primary bg-primary/5" : "border-input",
      )}
    >
      <span className="flex-none text-xs font-semibold text-muted-foreground">{etiqueta}</span>
      <select
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={cn(
          "min-w-0 flex-1 cursor-pointer bg-transparent text-sm outline-none",
          valor ? "font-semibold text-primary" : "text-foreground",
        )}
        aria-label={etiqueta}
      >
        <option value="">todos</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  );
}
