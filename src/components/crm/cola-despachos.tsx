import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fechaLima, fechaCalendario } from "@/lib/fechas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { queLoFrena, etiquetaResponsable, sinPrecios, type ServicioPostventa } from "@/lib/postventa";
import { cn } from "@/lib/utils";

/**
 * La cola de despachos (`servicios_postventa`), compartida entre el
 * Calendario y Atenciones.
 *
 * Es exactamente la pestaña «Lista» que nació en `/postventa/agenda` — se
 * extrae acá tal cual (regla del repo: parchar/reutilizar, no copiar) porque
 * el plan 23 la vuelve a mostrar como pestaña «Despachos» de Atenciones sin
 * duplicar la consulta ni el marcado.
 *
 * `pestana` decide la fuente: `lista` es la cola pendiente agrupada por
 * urgencia, `historico` es lo que vino del Excel, `completados` lo ya
 * cerrado. `hrefBase` es la URL de la pantalla que la muestra (cada una
 * arma sus propios enlaces de búsqueda y filtro con su propio prefijo).
 */

const FILTROS_ESTADO = [
  { clave: "", etiqueta: "Todos" },
  { clave: "atrasados", etiqueta: "Atrasados" },
  { clave: "sin_fecha", etiqueta: "Sin fecha" },
  { clave: "detenidos", etiqueta: "Detenidos" },
] as const;

export async function ColaDespachos({
  pestana,
  verValue,
  busqueda,
  estado,
  verPrecios,
  hrefBase,
}: {
  pestana: "lista" | "historico" | "completados";
  /** El valor que hay que preservar en `ver=` al armar los enlaces de esta pantalla. */
  verValue: string;
  busqueda: string;
  estado: string;
  verPrecios: boolean;
  hrefBase: string;
}) {
  const supabase = await createClient();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  // OJO CON EL FILTRO POR ORIGEN. Hoy las 174 filas de la tabla vienen del
  // Excel («origen = excel») y 106 siguen pendientes: filtrar la cola de
  // trabajo por `origen = crm` la dejaría vacía el primer día y escondería
  // justo lo que hay que resolver. Es el mismo error que vació el Kanban en el
  // plan 11. Lo que separa las pestañas es si está pendiente, no de dónde vino.
  let q = supabase.from("servicios_postventa").select("*", { count: "exact" });
  if (pestana === "lista") q = q.eq("completado", false);
  if (pestana === "historico") q = q.eq("origen", "excel");
  if (pestana === "completados") q = q.eq("completado", true);

  if (busqueda) {
    const patron = `%${busqueda}%`;
    q = q.or(`cliente_texto.ilike.${patron},equipo.ilike.${patron},ubicacion.ilike.${patron},guia.ilike.${patron}`);
  }
  if (estado === "sin_fecha") q = q.is("fecha_despacho", null);

  const { data, count } = await q
    .order("fecha_despacho", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(400);

  const enUnaSemana = new Date(new Date().getTime() + 7 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  let filas = ((data ?? []) as unknown as ServicioPostventa[]).map((s) => (verPrecios ? s : sinPrecios(s)));
  if (estado === "atrasados") filas = filas.filter((s) => s.fecha_despacho && s.fecha_despacho < hoy && !s.despachado_at);
  if (estado === "detenidos") filas = filas.filter((s) => queLoFrena(s)?.grave);

  const grupos: { titulo: string; alerta?: boolean; filas: ServicioPostventa[] }[] = [
    {
      titulo: "Atrasados",
      alerta: true,
      filas: filas.filter((s) => !s.completado && s.fecha_despacho && s.fecha_despacho < hoy && !s.despachado_at),
    },
    {
      titulo: "Esta semana",
      filas: filas.filter((s) => s.fecha_despacho && s.fecha_despacho >= hoy && s.fecha_despacho <= enUnaSemana),
    },
    {
      titulo: "Más adelante",
      filas: filas.filter((s) => s.fecha_despacho && s.fecha_despacho > enUnaSemana),
    },
    {
      titulo: "Sin fecha · por coordinar",
      filas: filas.filter((s) => !s.fecha_despacho),
    },
  ];
  const agrupar = pestana === "lista";
  const yaDespachados = filas.filter((s) => s.despachado_at && s.fecha_despacho && s.fecha_despacho < hoy);
  if (agrupar && yaDespachados.length) grupos.push({ titulo: "Despachados, esperando cierre", filas: yaDespachados });

  return (
    <div>
      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="ver" value={verValue} />
        <label className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
          <Search className="size-3.5 flex-none text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={busqueda}
            placeholder="Cliente, equipo, serie, guía o destino"
            className="w-full min-w-[160px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        {pestana === "lista" &&
          FILTROS_ESTADO.map((f) => (
            <Link
              key={f.clave || "todos"}
              href={`${hrefBase}?ver=${verValue}${f.clave ? `&estado=${f.clave}` : ""}${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ""}`}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                estado === f.clave
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.etiqueta}
            </Link>
          ))}
        <button type="submit" className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent">
          Buscar
        </button>
        {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
      </form>

      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {busqueda ? `Nada que coincida con «${busqueda}».` : "No hay servicios que mostrar acá."}
        </p>
      ) : agrupar ? (
        <div className="space-y-4">
          {grupos
            .filter((g) => g.filas.length > 0)
            .map((g) => (
              <div key={g.titulo}>
                <h3
                  className={cn(
                    "mb-1.5 text-[11px] font-bold uppercase tracking-wide",
                    g.alerta ? "text-amber-700" : "text-muted-foreground",
                  )}
                >
                  {g.titulo} ({g.filas.length})
                </h3>
                <div className="space-y-1">
                  {g.filas.map((s) => (
                    <FilaDespacho key={s.id} servicio={s} alerta={g.alerta} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <TablaHistoricaDespachos filas={filas} verPrecios={verPrecios} />
      )}
    </div>
  );
}

function FilaDespacho({ servicio: s, alerta }: { servicio: ServicioPostventa; alerta?: boolean }) {
  const frena = queLoFrena(s);
  return (
    <Link
      href={`/postventa/pedidos/${s.id}`}
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-md border p-2.5 transition-colors hover:bg-accent",
        alerta ? "border-amber-300 bg-amber-50/60" : "border-border",
      )}
    >
      <span className="w-20 flex-none font-mono text-xs font-semibold tabular-nums text-foreground">
        {s.fecha_despacho ? fechaLima(s.fecha_despacho) : "—"}
      </span>
      <div className="min-w-[200px] flex-1">
        <p className="text-sm font-medium text-foreground">{s.cliente_texto ?? "—"}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{s.equipo ?? "Sin equipo"}</p>
        {!s.fecha_despacho && s.despacho_nota && (
          <p className="text-[11px] text-muted-foreground">{s.despacho_nota}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 text-right">
        {s.ubicacion && (
          <span className="max-w-[180px] truncate text-[11px] text-muted-foreground">{s.ubicacion}</span>
        )}
        {frena && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              frena.grave ? "bg-amber-100 text-amber-900" : "bg-secondary text-muted-foreground",
            )}
          >
            {frena.grave ? frena.texto : etiquetaResponsable(frena.responsable)}
          </span>
        )}
      </div>
    </Link>
  );
}

/**
 * El Excel, tal como lo llevaban: las mismas columnas y su vocabulario
 * —confirmación de abono, prueba y embalaje, planos, puesta en marcha—. No se
 * "mejoró" al traerlo porque es el documento con el que trabajaron años y tiene
 * que poder leerse igual. Lo único que se le agregó es el buscador.
 */
function TablaHistoricaDespachos({ filas, verPrecios }: { filas: ServicioPostventa[]; verPrecios: boolean }) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[1100px]">
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Equipo</TableHead>
            <TableHead>Servicio</TableHead>
            <TableHead>Ubicación</TableHead>
            {verPrecios && <TableHead className="text-right">Monto</TableHead>}
            <TableHead>Abono</TableHead>
            <TableHead>Prueba</TableHead>
            <TableHead>Despacho</TableHead>
            <TableHead>Planos</TableHead>
            <TableHead>Puesta en marcha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="max-w-[220px] align-top text-xs font-medium whitespace-normal break-words">
                {s.cliente_texto ?? "—"}
                {s.fecha_confirmacion && (
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    compra {fechaCalendario(s.fecha_confirmacion)}
                  </span>
                )}
              </TableCell>
              <TableCell className="max-w-[260px] align-top text-[11px] text-muted-foreground">
                <span className="line-clamp-4 whitespace-pre-line">{s.equipo ?? "—"}</span>
              </TableCell>
              <TableCell className="align-top text-xs">{s.tipo_servicio}</TableCell>
              <TableCell className="max-w-[160px] align-top text-[11px] text-muted-foreground whitespace-normal break-words">
                {s.ubicacion ?? "—"}
              </TableCell>
              {verPrecios && (
                <TableCell className="align-top text-right text-xs tabular-nums">
                  {s.monto != null ? `${s.moneda} ${Number(s.monto).toLocaleString("es-PE")}` : "—"}
                </TableCell>
              )}
              <TableCell className="align-top text-xs">{s.confirmacion_abono ?? "—"}</TableCell>
              <TableCell className="align-top text-xs">{s.prueba_embalaje ?? "—"}</TableCell>
              <TableCell className="align-top text-xs tabular-nums">
                {s.fecha_despacho ? fechaLima(s.fecha_despacho) : (s.despacho_nota ?? "—")}
              </TableCell>
              <TableCell className="align-top text-xs">{s.planos_preinstalacion ?? "—"}</TableCell>
              <TableCell className="align-top text-xs">
                {s.puesta_en_marcha ? fechaLima(s.puesta_en_marcha) : (s.puesta_nota ?? "—")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
