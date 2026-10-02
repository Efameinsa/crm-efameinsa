"use client";

import { useMemo, useState } from "react";
import Link from "@/components/enlace";
import { Search } from "lucide-react";
import {
  deOrigenParque,
  estadoGestionParque,
  ETIQUETA_GESTION_PARQUE,
  filtrarParque,
  mesesDelAnio,
  MESES_CORTOS,
  personasDelParque,
  type ClienteParque,
  type EstadoGestionParque,
  type FiltrosParque,
  type OrigenParque,
} from "@/lib/parque";
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
 *
 * 02-10, GERENCIA: MES Y GESTIÓN. Carlos, con Ariana y Gabriela: «ahora me vas
 * a dar por mes. Dentro de un año, por mes», y «ahora quién lo hizo. Si no lo
 * hizo, o le falta hacer, o está en proceso». Los cortes son puros y viven en
 * `filtrarParque` (lib/parque.ts), con sus pruebas.
 */

const POR_TANDA = 80;

const COLOR: Record<EstadoMantenimiento, string> = {
  nunca: "bg-destructive/10 text-destructive",
  vencido: "bg-amber-500/15 text-amber-800",
  al_dia: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  sin_dato: "bg-secondary text-muted-foreground",
};

const TITULO_GESTION: Record<EstadoGestionParque, string> = {
  nadie: "Nadie registró ninguna llamada, visita ni mensaje con este cliente",
  falta: "Alguien ya habló con él, pero no quedó ninguna oportunidad de mantenimiento abierta: le falta el seguimiento",
  en_proceso: "Ya hay una oportunidad de mantenimiento abierta: se entra a esa, no se abre otra",
};

type Origen = OrigenParque;
type Valores = Required<Pick<FiltrosParque, "estado" | "anio" | "mes" | "gestion" | "quien">> & { q: string; origen: Origen };

export function ListaParque({
  todos,
  verTodo,
  inicial,
  yo,
}: {
  todos: ClienteParque[];
  verTodo: boolean;
  inicial: Valores;
  /** Clave de quien mira (`clavePersona`), para el atajo «Las mías». */
  yo: string | null;
}) {
  const [v, setV] = useState<Valores>(inicial);
  const [visibles, setVisibles] = useState(POR_TANDA);
  const { q, estado, anio, mes, origen, gestion, quien } = v;

  // La URL refleja el filtro sin pedirle nada al servidor.
  function cambiar(cambios: Partial<Valores>) {
    const n = { ...v, ...cambios };
    // El mes vive dentro del año: si se suelta el año, se suelta el mes.
    if (!n.anio) n.mes = null;
    setV(n);
    const p = new URLSearchParams();
    if (verTodo) p.set("todos", "1");
    if (n.q.trim()) p.set("q", n.q.trim());
    if (n.estado) p.set("estado", n.estado);
    if (n.anio) p.set("anio", n.anio);
    if (n.mes) p.set("mes", n.mes);
    if (n.origen) p.set("origen", n.origen);
    if (n.gestion) p.set("gestion", n.gestion);
    if (n.quien) p.set("quien", n.quien);
    const s = p.toString();
    window.history.replaceState(null, "", `/comercial/parque${s ? `?${s}` : ""}`);
    setVisibles(POR_TANDA);
  }

  // EL ORDEN DEL BARRIDO (Carlos, 10-09). Primero los clientes que ya compraron
  // mantenimiento, año por año hacia atrás; recién cuando ese lote se termina,
  // los demás. El que ya compró mantenimiento va en el primer lote aunque
  // también nos haya comprado equipos; el segundo es «todo lo demás», incluidos
  // los 35 con la máquina fichada y sin fila de venta.
  const delLote = useMemo(() => todos.filter((c) => deOrigenParque(c, origen)), [todos, origen]);

  const filas = useMemo(() => filtrarParque(todos, v), [todos, v]);
  // Los conteos de gestión y de personas se cuentan con todo lo demás puesto
  // —lote, año, mes, estado, búsqueda— pero sin su propio recorte: así se lee
  // «de los de marzo de 2025, 14 no los llamó nadie y 6 son de Ariana».
  const sinGestion = useMemo(() => filtrarParque(todos, { ...v, gestion: null, quien: null }), [todos, v]);
  const cuentaGestion = (g: EstadoGestionParque) => sinGestion.filter((c) => estadoGestionParque(c) === g).length;
  const personas = useMemo(() => personasDelParque(sinGestion), [sinGestion]);
  const misClientes = yo ? (personas.find((p) => p.clave === yo)?.n ?? 0) : 0;

  const cuenta = (e: EstadoMantenimiento) => todos.filter((c) => c.estado === e).length;
  const conCierreDePostventa = todos.filter((c) => c.ventasDePostventa > 0).length;
  const soloComercial = todos.filter((c) => c.ventasDePostventa === 0).length;
  // Los años en los que la empresa vendió, del más nuevo al más viejo, contados
  // sobre el lote elegido: es como se sabe si un año ya se terminó.
  const anios = useMemo(
    () =>
      [...delLote.reduce((m, c) => {
        const a = (c.ultimaCompraAt ?? "").slice(0, 4);
        if (a) m.set(a, (m.get(a) ?? 0) + 1);
        return m;
      }, new Map<string, number>())].sort((a, b) => b[0].localeCompare(a[0])),
    [delLote],
  );
  // Y dentro del año, los meses (02-10): de enero a diciembre, solo los que tienen ventas.
  const meses = useMemo(
    () => (anio ? [...mesesDelAnio(delLote, anio)].sort((a, b) => a[0].localeCompare(b[0])) : []),
    [delLote, anio],
  );
  const mostradas = filas.slice(0, visibles);

  const chip = (activo: boolean) =>
    cn(
      "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
      activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent",
    );
  const rotulo = "mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => cambiar({ q: e.target.value })}
            placeholder="Buscar por cliente o RUC…"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(!estado)} onClick={() => cambiar({ estado: null })}>
            Todos ({todos.length})
          </button>
          {(["nunca", "vencido", "al_dia", "sin_dato"] as EstadoMantenimiento[]).map((e) => (
            <button key={e} type="button" className={chip(estado === e)} onClick={() => cambiar({ estado: estado === e ? null : e })}>
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
                onClick={() => cambiar({ origen: valor, anio: null, mes: null })}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>
      )}

      {anios.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className={rotulo}>Compró en</span>
          <button type="button" className={chip(!anio)} onClick={() => cambiar({ anio: null })}>
            Todos los años
          </button>
          {anios.map(([a, n]) => (
            <button key={a} type="button" className={chip(anio === a)} onClick={() => cambiar({ anio: anio === a ? null : a, mes: null })}>
              {a} ({n})
            </button>
          ))}
        </div>
      )}

      {/* EL MES, DENTRO DEL AÑO (gerencia, 02-10): «dentro de un año, por mes».
          Aparece recién cuando se elige un año. */}
      {anio && meses.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className={rotulo}>Mes de {anio}</span>
          <button type="button" className={chip(!mes)} onClick={() => cambiar({ mes: null })}>
            Todo el año
          </button>
          {meses.map(([m, n]) => (
            <button key={m} type="button" className={chip(mes === m)} onClick={() => cambiar({ mes: mes === m ? null : m })}>
              {MESES_CORTOS[Number(m) - 1]} ({n})
            </button>
          ))}
        </div>
      )}

      {/* LA GESTIÓN: QUIÉN Y EN QUÉ QUEDÓ (gerencia, 02-10). «Ahora quién lo
          hizo. Si no lo hizo, o le falta hacer, o está en proceso.» Son tres
          personas vendiendo el preventivo: cada una sigue la suya y no toca al
          cliente que otra ya está trabajando. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className={rotulo}>Última gestión</span>
        <button type="button" className={chip(!gestion)} onClick={() => cambiar({ gestion: null })}>
          Todas
        </button>
        {(["nadie", "falta", "en_proceso"] as EstadoGestionParque[]).map((g) => (
          <button
            key={g}
            type="button"
            className={chip(gestion === g)}
            title={TITULO_GESTION[g]}
            onClick={() => cambiar({ gestion: gestion === g ? null : g })}
          >
            {ETIQUETA_GESTION_PARQUE[g]} ({cuentaGestion(g)})
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" />
        {yo && (misClientes > 0 || quien === yo) && (
          <button
            type="button"
            className={cn(chip(quien === yo), "font-semibold")}
            title="Los clientes donde la última gestión o la oportunidad abierta es suya: para continuar su gestión"
            onClick={() => cambiar({ quien: quien === yo ? null : yo })}
          >
            Las mías ({misClientes})
          </button>
        )}
        {(personas.length > 0 || quien) && (
          <label
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full border bg-background px-2.5 text-xs",
              quien ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <span className="font-semibold text-muted-foreground">Quién</span>
            <select
              value={quien ?? ""}
              onChange={(e) => cambiar({ quien: e.target.value || null })}
              className={cn("cursor-pointer bg-transparent outline-none", quien ? "font-semibold text-primary" : "text-foreground")}
              aria-label="Quién hizo la gestión"
            >
              <option value="">cualquiera</option>
              {personas.map((p) => (
                <option key={p.clave} value={p.clave}>
                  {p.nombre} ({p.n})
                </option>
              ))}
              {/* Si vino por la URL alguien que con estos filtros no aparece, igual se muestra. */}
              {quien && !personas.some((p) => p.clave === quien) && <option value={quien}>{quien} (0)</option>}
            </select>
          </label>
        )}
      </div>

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
