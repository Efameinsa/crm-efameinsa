"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
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
 * desplegables. Todo vive en la URL, así que la tanda se puede compartir por
 * WhatsApp y el botón «atrás» funciona.
 */

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
  q,
  mant,
  compra,
  llamada,
  visibles,
  total,
}: {
  q: string;
  mant: EstadoMantenimiento | null;
  compra: EstadoCompra | null;
  llamada: EstadoLlamada | null;
  /** Cuántas filas quedaron en esta pestaña con los filtros puestos. */
  visibles: number;
  /** Cuántas hay en la pestaña sin filtrar. */
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const [texto, setTexto] = useState(q);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTexto(q);
  }, [q]);

  function navegar(cambios: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    // Cualquier cambio de filtro vuelve a mostrar la primera tanda.
    params.delete("todos");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  // La búsqueda aplica al dejar de escribir: una navegación por tecla haría
  // parpadear una lista de 249 filas.
  useEffect(() => {
    if (texto === q) return;
    const t = setTimeout(() => navegar({ q: texto.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const hayFiltro = Boolean(mant || compra || llamada || q);

  function atajoActivo(a: (typeof ATAJOS)[number]) {
    return (
      (a.filtros.mant ?? null) === mant &&
      (a.filtros.compra ?? null) === compra &&
      (a.filtros.llamada ?? null) === llamada
    );
  }

  return (
    <div className="relative mb-4 rounded-xl border border-border bg-muted/30 p-3">
      {/* Cuatro columnas iguales: los tres desplegables entran en una fila con
          la búsqueda, y en el celular se apilan solos. */}
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
          onChange={(v) => navegar({ mant: v })}
          opciones={Object.entries(ETIQUETA_MANTENIMIENTO).map(([valor, texto]) => ({ valor, texto }))}
        />
        <Filtro
          etiqueta="Compró"
          valor={compra}
          onChange={(v) => navegar({ compra: v })}
          opciones={Object.entries(ETIQUETA_COMPRA).map(([valor, texto]) => ({ valor, texto }))}
        />
        <Filtro
          etiqueta="Llamada"
          valor={llamada}
          onChange={(v) => navegar({ llamada: v })}
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
                navegar(
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

        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {pendiente && <Loader2 className="size-3.5 animate-spin" />}
          <span>
            <b className="text-foreground tabular-nums">{visibles.toLocaleString("es-PE")}</b>
            {hayFiltro && <> de {total.toLocaleString("es-PE")}</>} en esta pestaña
          </span>
          {hayFiltro && (
            <button
              type="button"
              onClick={() => {
                setTexto("");
                navegar({ mant: null, compra: null, llamada: null, q: null });
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
