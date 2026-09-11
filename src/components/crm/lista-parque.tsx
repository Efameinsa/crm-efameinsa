"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { ClienteParque } from "@/lib/parque";
import { ETIQUETA_MANTENIMIENTO, type EstadoMantenimiento } from "@/lib/ruta-mantenimiento";
import { OfrecerMantenimientoBoton } from "@/components/crm/ofrecer-mantenimiento-boton";
import { fechaCalendario, fechaLimaCorta } from "@/lib/fechas";
import { ETIQUETA_ACTIVIDAD } from "@/components/crm/etiquetas-actividad";
import { cn } from "@/lib/utils";

/**
 * La lista del parque, filtrada EN EL NAVEGADOR.
 *
 * Santos, 11-09: «Ariana, para ver todos los historiales en diferentes años,
 * se demora en cargar como unos segundos […] creo que hace un momento se colgó
 * y tuvimos que cerrar y abrir de nuevo su PWA».
 *
 * Lo que pasaba: cada clic en un año, un lote o un estado era un viaje al
 * servidor que volvía a armar los 731 clientes desde cero (1,5–2 s), y como
 * era la misma pantalla con otro filtro, Next dejaba lo viejo en pantalla sin
 * ningún «cargando» — así que se hacía clic dos y tres veces. Y «Ver los 481
 * restantes» armaba una página de 3 MB con 700 filas de golpe, que es lo que
 * trababa la aplicación instalada.
 *
 * Ahora la lista baja UNA vez y los filtros se aplican acá, al instante. La
 * URL se mantiene al día (sin pedirle nada al servidor) para que un filtro se
 * pueda compartir por WhatsApp y el botón «atrás» siga funcionando. Y nunca
 * se pintan más de 80 filas seguidas: «Ver 80 más» va sumando de a tandas.
 *
 * Lo que sigue yendo al servidor es cambiar de conjunto —«Mi cartera» /
 * «Toda la empresa»—, que es otra lista, y ahí sí sale la pantalla de carga.
 */

const POR_TANDA = 80;

const COLOR: Record<EstadoMantenimiento, string> = {
  nunca: "bg-destructive/10 text-destructive",
  vencido: "bg-amber-500/15 text-amber-800",
  al_dia: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  sin_dato: "bg-secondary text-muted-foreground",
};

type Origen = "postventa" | "comercial" | null;

export function ListaParque({
  todos,
  verTodo,
  inicial,
}: {
  todos: ClienteParque[];
  verTodo: boolean;
  inicial: { q: string; estado: EstadoMantenimiento | null; anio: string | null; origen: Origen };
}) {
  const [q, setQ] = useState(inicial.q);
  const [estado, setEstado] = useState<EstadoMantenimiento | null>(inicial.estado);
  const [anio, setAnio] = useState<string | null>(inicial.anio);
  const [origen, setOrigen] = useState<Origen>(inicial.origen);
  const [visibles, setVisibles] = useState(POR_TANDA);

  // La URL refleja el filtro sin pedirle nada al servidor.
  function sincronizarUrl(cambios: Partial<{ q: string; estado: EstadoMantenimiento | null; anio: string | null; origen: Origen }>) {
    const estadoFinal = { q, estado, anio, origen, ...cambios };
    const p = new URLSearchParams();
    if (verTodo) p.set("todos", "1");
    if (estadoFinal.q.trim()) p.set("q", estadoFinal.q.trim());
    if (estadoFinal.estado) p.set("estado", estadoFinal.estado);
    if (estadoFinal.anio) p.set("anio", estadoFinal.anio);
    if (estadoFinal.origen) p.set("origen", estadoFinal.origen);
    const s = p.toString();
    window.history.replaceState(null, "", `/comercial/parque${s ? `?${s}` : ""}`);
    setVisibles(POR_TANDA);
  }

  // EL ORDEN DEL BARRIDO (Carlos, 10-09). Primero los clientes que ya compraron
  // mantenimiento, año por año hacia atrás; recién cuando ese lote se termina,
  // los demás. El que ya compró mantenimiento va en el primer lote aunque
  // también nos haya comprado equipos; el segundo es «todo lo demás», incluidos
  // los 35 con la máquina fichada y sin fila de venta.
  const deOrigen = (c: ClienteParque) =>
    origen === "postventa" ? c.ventasDePostventa > 0 : origen === "comercial" ? c.ventasDePostventa === 0 : true;

  const patron = q.trim().toLowerCase();
  const filas = useMemo(
    () =>
      todos.filter(
        (c) =>
          (!estado || c.estado === estado) &&
          deOrigen(c) &&
          (!anio || (c.ultimaCompraAt ?? "").slice(0, 4) === anio) &&
          (!patron || c.razonSocial.toLowerCase().includes(patron) || (c.numDoc ?? "").includes(patron)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todos, estado, anio, origen, patron],
  );
  const cuenta = (e: EstadoMantenimiento) => todos.filter((c) => c.estado === e).length;
  const conCierreDePostventa = todos.filter((c) => c.ventasDePostventa > 0).length;
  const soloComercial = todos.filter((c) => c.ventasDePostventa === 0).length;
  // Los años en los que la empresa vendió, del más nuevo al más viejo, contados
  // sobre el lote elegido: es como se sabe si un año ya se terminó.
  const anios = useMemo(
    () =>
      [...todos.filter(deOrigen).reduce((m, c) => {
        const a = (c.ultimaCompraAt ?? "").slice(0, 4);
        if (a) m.set(a, (m.get(a) ?? 0) + 1);
        return m;
      }, new Map<string, number>())].sort((a, b) => b[0].localeCompare(a[0])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todos, origen],
  );
  const mostradas = filas.slice(0, visibles);

  const chip = (activo: boolean) =>
    cn(
      "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
      activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent",
    );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              sincronizarUrl({ q: e.target.value });
            }}
            placeholder="Buscar por cliente o RUC…"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(!estado)} onClick={() => { setEstado(null); sincronizarUrl({ estado: null }); }}>
            Todos ({todos.length})
          </button>
          {(["nunca", "vencido", "al_dia", "sin_dato"] as EstadoMantenimiento[]).map((e) => (
            <button
              key={e}
              type="button"
              className={chip(estado === e)}
              onClick={() => {
                const nuevo = estado === e ? null : e;
                setEstado(nuevo);
                sincronizarUrl({ estado: nuevo });
              }}
            >
              {ETIQUETA_MANTENIMIENTO[e]} ({cuenta(e)})
            </button>
          ))}
        </div>
      </div>

      {verTodo && conCierreDePostventa > 0 && soloComercial > 0 && (
        <div className="mb-3 rounded-xl border border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
            Se trabaja en este orden: primero los que <b>ya nos compraron mantenimiento</b> —a esos se les llama para
            repetirlo—, año por año hacia atrás. Cuando ese lote se termina, recién los demás.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["postventa", `Ya compraron mantenimiento (${conCierreDePostventa.toLocaleString("es-PE")})`],
                ["comercial", `Solo compraron equipos (${soloComercial.toLocaleString("es-PE")})`],
                [null, "Todos"],
              ] as [Origen, string][]
            ).map(([valor, texto]) => (
              <button
                key={String(valor)}
                type="button"
                className={cn(chip(origen === valor), "font-semibold")}
                onClick={() => {
                  setOrigen(valor);
                  setAnio(null);
                  sincronizarUrl({ origen: valor, anio: null });
                }}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>
      )}

      {anios.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Compró en</span>
          <button type="button" className={chip(!anio)} onClick={() => { setAnio(null); sincronizarUrl({ anio: null }); }}>
            Todos los años
          </button>
          {anios.map(([a, n]) => (
            <button
              key={a}
              type="button"
              className={chip(anio === a)}
              onClick={() => {
                const nuevo = anio === a ? null : a;
                setAnio(nuevo);
                sincronizarUrl({ anio: nuevo });
              }}
            >
              {a} ({n})
            </button>
          ))}
        </div>
      )}

      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {todos.length === 0
            ? "Todavía no hay ventas ni máquinas fichadas en su cartera. La lista se arma con las ventas registradas y con los equipos que se fichan al cerrar una venta con serie."
            : "Nada con ese filtro."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 font-medium">Qué le vendimos</th>
                <th className="px-2 py-2 font-medium">Último mantenimiento</th>
                <th className="px-2 py-2 font-medium">Última gestión (de quien sea)</th>
                <th className="px-2 py-2 font-medium">Mantenimiento</th>
              </tr>
            </thead>
            <tbody>
              {mostradas.map((c) => (
                <FilaParque key={c.cuentaId} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
        <span>
          {mostradas.length.toLocaleString("es-PE")} de {filas.length.toLocaleString("es-PE")}
          {filas.length !== todos.length && <> (filtrados de {todos.length.toLocaleString("es-PE")})</>}
        </span>
        {mostradas.length < filas.length && (
          // De a tandas, nunca todo: 700 filas de golpe fue lo que trabó la
          // aplicación instalada.
          <button
            type="button"
            onClick={() => setVisibles((v) => v + POR_TANDA)}
            className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-accent"
          >
            Ver {Math.min(POR_TANDA, filas.length - mostradas.length)} más
          </button>
        )}
      </div>
    </>
  );
}

function FilaParque({ c }: { c: ClienteParque }) {
  return (
    <tr className="border-b border-border align-top last:border-0 hover:bg-accent/40">
      <td className="px-2 py-2">
        <Link href={`/comercial/cartera/${c.cuentaId}`} className="block font-semibold text-foreground hover:underline">
          {c.razonSocial}
        </Link>
        <span className="block text-[11px] text-muted-foreground">
          {[c.numDoc, c.zona].filter(Boolean).join(" · ") || "—"}
        </span>
        {/* DE QUIÉN ES, EN LA LISTA (gerencia, 10-09): es lo que evita la
            llamada cruzada. La cartera no se mueve: lo que hace postventa es la
            oportunidad de mantenimiento (0080). */}
        {c.carteraDe && (
          <span
            className="mt-0.5 inline-block rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
            title={c.carteraNombre ? `Cliente de la cartera de ${c.carteraNombre}` : undefined}
          >
            cartera de {c.carteraDe}
          </span>
        )}
      </td>
      <td className="px-2 py-2">
        <span className="font-semibold tabular-nums text-foreground">
          {c.equipos > 0 ? `${c.equipos} máquina${c.equipos === 1 ? "" : "s"}` : "sin ficha de equipo"}
        </span>
        <span className="block max-w-56 truncate text-[11px] text-muted-foreground" title={c.modelos.join(" · ")}>
          {c.modelos.join(" · ") || "no consta qué equipo"}
        </span>
        {c.ultimaCompraAt && <span className="block text-[11px] text-muted-foreground">compró {fechaCalendario(c.ultimaCompraAt)}</span>}
      </td>
      <td className="px-2 py-2">
        <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", COLOR[c.estado])}>{ETIQUETA_MANTENIMIENTO[c.estado]}</span>
        <span className="block text-[11px] text-muted-foreground">
          {c.ultimoMantenimiento
            ? `${fechaCalendario(c.ultimoMantenimiento)} · hace ${c.mesesSinMantenimiento} meses`
            : c.ultimaCompraAt
              ? `ninguno desde la compra (${c.mesesSinMantenimiento} meses)`
              : "sin registro"}
        </span>
        {c.garantiaHasta && <span className="block text-[11px] text-muted-foreground">garantía hasta {fechaCalendario(c.garantiaHasta)}</span>}
      </td>
      <td className="px-2 py-2">
        {c.ultimaGestion ? (
          <>
            <span className="text-foreground">{ETIQUETA_ACTIVIDAD[c.ultimaGestion.tipo] ?? c.ultimaGestion.tipo}</span>
            <span className="block text-[11px] text-muted-foreground">
              {fechaLimaCorta(c.ultimaGestion.at)} · {c.ultimaGestion.quien}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">nadie lo ha llamado</span>
        )}
      </td>
      <td className="px-2 py-2">
        {/* PIDIÓ QUE NO LO LLAMEN (0217): se marca y no se ofrece el botón. */}
        {c.noContactar ? (
          <span className="inline-block rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] font-semibold text-destructive">
            Pidió que no lo contacten
          </span>
        ) : c.enGestion ? (
          <Link href={`/comercial/oportunidades/${c.enGestion.oportunidadId}`} className="block rounded-md border border-border px-2 py-1 hover:bg-accent">
            <span className="block font-semibold text-foreground">En gestión por {c.enGestion.quien}</span>
            <span className="block text-[11px] text-muted-foreground">
              desde {fechaCalendario(c.enGestion.desde)}
              {c.enGestion.proximaAccion ? ` · ${c.enGestion.proximaAccion}` : ""}
            </span>
          </Link>
        ) : (
          <OfrecerMantenimientoBoton cuentaId={c.cuentaId} compacto />
        )}
      </td>
    </tr>
  );
}
