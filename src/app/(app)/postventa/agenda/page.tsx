import Link from "next/link";
import { CalendarPlus, Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaLima, fechaCalendario } from "@/lib/fechas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { queLoFrena, etiquetaResponsable, puedeVerPrecios, sinPrecios, type ServicioPostventa } from "@/lib/postventa";
import {
  CalendarioPostventa,
  type VistaCalendario,
} from "@/components/crm/calendario-postventa";
import {
  eventoDeCaso,
  eventosDePedido,
  filtrarPorZona,
  sinFecha as pedidosSinFecha,
  type CasoAgendable,
  type EventoCalendario,
} from "@/lib/calendario-postventa";
import { diasDelMes, diasDeSemana, lunesDe } from "@/lib/calendario";
import { requerirPerfil } from "@/lib/auth";
import { ETIQUETA_TIPO_ATENCION } from "@/lib/atenciones";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * El calendario del área, con la lista al lado.
 *
 * Nació como «agenda de despachos»: una lista ordenada por fecha de despacho
 * ascendente sobre una tabla que arrancó con 240 filas de 2025, así que lo
 * primero que se veía era el año pasado. Carlos la rebautizó mientras la
 * miraba, pidiendo lo que le faltaba: «el lunes vamos a atender dos clientes,
 * uno en La Victoria, otro en el Centro… ¿qué voy a hacer mañana, qué voy a
 * hacer en la semana?».
 *
 * Por eso son DOS pantallas en una, y ninguna sobra: el calendario responde
 * «¿cuándo?» y la lista responde «¿qué me falta?». El área hace las dos cosas.
 *
 * Y sigue siendo un Server Component: los filtros son enlaces y el buscador es
 * un form GET, así que anda sin JavaScript.
 */

const PESTANAS = [
  { clave: "calendario", etiqueta: "Calendario" },
  { clave: "lista", etiqueta: "Lista" },
  { clave: "historico", etiqueta: "Histórico del Excel" },
  { clave: "completados", etiqueta: "Completados" },
] as const;

type Pestana = (typeof PESTANAS)[number]["clave"];

const FILTROS_ESTADO = [
  { clave: "", etiqueta: "Todos" },
  { clave: "atrasados", etiqueta: "Atrasados" },
  { clave: "sin_fecha", etiqueta: "Sin fecha" },
  { clave: "detenidos", etiqueta: "Detenidos" },
] as const;

export default async function AgendaPostventaPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; q?: string; estado?: string; vista?: string; fecha?: string; zona?: string }>;
}) {
  const sp = await searchParams;
  // «gestion» era el nombre viejo de la lista: los enlaces que quedaron dando
  // vueltas —y el guardado en favoritos de quien la usa todos los días— tienen
  // que seguir llevando a la misma pantalla.
  const pedida = sp.ver === "gestion" ? "lista" : sp.ver;
  const pestana: Pestana = (PESTANAS.find((p) => p.clave === pedida)?.clave ?? "calendario") as Pestana;
  const busqueda = (sp.q ?? "").trim();
  const estado = sp.estado ?? "";
  const supabase = await createClient();
  const perfil = await requerirPerfil();
  // La columna «Monto» del Excel histórico no se le muestra al área: es la
  // venta del equipo, y esa cifra no es de su interés (Carlos, 27-08).
  const verPrecios = puedeVerPrecios(perfil);

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  if (pestana === "calendario") {
    const vista: VistaCalendario = (["semana", "mes", "dia"] as const).includes(sp.vista as VistaCalendario)
      ? (sp.vista as VistaCalendario)
      : "semana";
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? "") ? (sp.fecha as string) : hoy;
    const zona = sp.zona === "lima" || sp.zona === "provincia" ? sp.zona : "";

    // El rango que se está mirando, para no traerse la tabla entera.
    const dias =
      vista === "mes"
        ? diasDelMes(fecha.slice(0, 7)).map((d) => d.iso)
        : vista === "semana"
          ? diasDeSemana(lunesDe(fecha))
          : [fecha];
    const desde = dias[0];
    const hasta = dias[dias.length - 1];

    const verTodo = perfil.rol === "gerencia" || perfil.rol === "admin";
    let consultaCasos = supabase
      .from("oportunidades")
      .select(
        "id, etapa, intencion, tipo_postventa, proxima_accion, proxima_accion_at, proxima_accion_hora, cuentas(razon_social, departamento, distrito)",
      )
      .not("tipo_postventa", "is", null)
      .gte("proxima_accion_at", desde)
      .lte("proxima_accion_at", hasta)
      .limit(300);
    if (!verTodo) consultaCasos = consultaCasos.eq("comercial_id", perfil.id);

    const [{ data: pedidos }, { data: casos }, { data: abiertos }] = await Promise.all([
      supabase
        .from("servicios_postventa")
        .select("*")
        .or(
          `and(fecha_despacho.gte.${desde},fecha_despacho.lte.${hasta}),and(puesta_en_marcha.gte.${desde},puesta_en_marcha.lte.${hasta})`,
        )
        .limit(400),
      consultaCasos,
      supabase
        .from("servicios_postventa")
        .select("id, cliente_texto, equipo, despacho_nota, completado, fecha_despacho, puesta_en_marcha")
        .eq("completado", false)
        .is("fecha_despacho", null)
        .is("puesta_en_marcha", null)
        .limit(200),
    ]);

    const listaPedidos = ((pedidos ?? []) as unknown as ServicioPostventa[]).map((s) =>
      verPrecios ? s : sinPrecios(s),
    );
    const eventosPedidos = listaPedidos.flatMap(eventosDePedido);
    const eventosCasos = ((casos ?? []) as unknown as {
      id: string;
      etapa: string;
      intencion: string | null;
      tipo_postventa: string | null;
      proxima_accion: string | null;
      proxima_accion_at: string | null;
      proxima_accion_hora: string | null;
      cuentas: { razon_social: string; departamento: string | null; distrito: string | null } | null;
    }[])
      .map((c): CasoAgendable => {
        const dep = (c.cuentas?.departamento ?? "").toUpperCase();
        return {
          id: c.id,
          tipo_postventa: c.tipo_postventa,
          intencion: c.intencion,
          etapa: c.etapa,
          proxima_accion: c.proxima_accion,
          proxima_accion_at: c.proxima_accion_at,
          proxima_accion_hora: c.proxima_accion_hora,
          cliente: c.cuentas?.razon_social ?? "Cliente sin nombre",
          zona: dep ? (dep === "LIMA" ? "lima" : "provincia") : null,
        };
      })
      .map(eventoDeCaso)
      .filter((e): e is EventoCalendario => e !== null);

    // LO QUE SE PUEDE AGENDAR EN UNA CASILLA. Santos, 31-08, mirando la semana:
    // «no veo que se pueda agendar nada el martes ni miércoles ni otros días
    // que vienen». El calendario mostraba lo ya programado y nada más. Lo que
    // el área agenda es una atención ya diagnosticada a la que le falta día,
    // hora y técnico — el paso de Planificación—, así que se traen esas para
    // poder elegirlas desde el día que se está mirando.
    const { data: aProgramar } = await supabase
      .from("atenciones")
      .select("id, tipo, detalle, cliente_texto, cuentas(razon_social)")
      .eq("etapa", "diagnostico")
      .is("cerrado_at", null)
      .order("solicitado_at", { ascending: true })
      .limit(50);
    const atencionesPorProgramar = ((aProgramar ?? []) as unknown as {
      id: string;
      tipo: string;
      detalle: string | null;
      cliente_texto: string | null;
      cuentas: { razon_social: string } | null;
    }[]).map((a) => ({
      id: a.id,
      cliente: a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre",
      tipo: ETIQUETA_TIPO_ATENCION[a.tipo as keyof typeof ETIQUETA_TIPO_ATENCION] ?? a.tipo,
      detalle: a.detalle,
    }));

    const eventos = filtrarPorZona([...eventosPedidos, ...eventosCasos], zona);
    const porProgramar = pedidosSinFecha((abiertos ?? []) as unknown as ServicioPostventa[]).map((s) => ({
      id: s.id,
      cliente: s.cliente_texto ?? "Cliente sin nombre",
      equipo: s.equipo,
      nota: s.despacho_nota,
    }));

    return (
      <SeccionPanel
        titulo="Calendario de atenciones"
        accion={
          <div className="flex flex-wrap items-center gap-2">
            <BotonesAgendar />
            <Pestanas pestana={pestana} busqueda={busqueda} />
          </div>
        }
      >
        <CalendarioPostventa
          vista={vista}
          fecha={fecha}
          hoy={hoy}
          zona={zona}
          eventos={eventos}
          porProgramar={porProgramar}
          atencionesPorProgramar={atencionesPorProgramar}
        />
      </SeccionPanel>
    );
  }

  // ── Las tres pestañas de lista ────────────────────────────────────────────
  //
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

  // Los cuatro grupos, en el orden en que importan.
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
  // En completados y en el histórico la urgencia no significa nada: es un
  // archivo, y lo que se busca ahí es un cliente, no un vencimiento.
  const agrupar = pestana === "lista";
  const yaDespachados = filas.filter((s) => s.despachado_at && s.fecha_despacho && s.fecha_despacho < hoy);
  if (agrupar && yaDespachados.length) grupos.push({ titulo: "Despachados, esperando cierre", filas: yaDespachados });

  return (
    <SeccionPanel
      titulo="Calendario de atenciones"
      accion={<Pestanas pestana={pestana} busqueda={busqueda} conteo={count ?? 0} />}
    >
      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="ver" value={pestana} />
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
              href={`/postventa/agenda?ver=lista${f.clave ? `&estado=${f.clave}` : ""}${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ""}`}
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
                    <FilaAgenda key={s.id} servicio={s} alerta={g.alerta} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <TablaHistorica filas={filas} verPrecios={verPrecios} />
      )}
    </SeccionPanel>
  );
}

/**
 * Desde dónde se agenda, dicho en la pantalla.
 *
 * Hever avisó el 31-08 que quiso poner algo en el calendario del día y no
 * encontró cómo. Tenía razón por partida doble: en «Mi agenda» el botón estaba
 * escondido hasta pasar el mouse, y ACÁ —la pantalla que él llama calendario—
 * no hay nada que crear, es solo lectura de lo que ya existe.
 *
 * No se inventa un «evento de calendario» suelto: lo que el área agenda es una
 * atención, y la atención ya se crea en /postventa/casos/nuevo. Lo que faltaba
 * era decirlo desde acá en vez de dejar al usuario buscándolo en el menú. Lo
 * personal —recordatorios sin cliente— vive en «Mi agenda», y también se enlaza,
 * porque son las dos cosas que uno quiere «agendar» y viven en pantallas
 * distintas.
 */
function BotonesAgendar() {
  return (
    <div className="flex items-center gap-1.5">
      <Link
        href="/postventa/casos/nuevo"
        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground hover:brightness-110"
      >
        <Plus className="size-3.5" /> Nueva atención
      </Link>
      <Link
        href="/comercial/agenda"
        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <CalendarPlus className="size-3.5" /> Tarea personal
      </Link>
    </div>
  );
}

function Pestanas({ pestana, busqueda, conteo }: { pestana: Pestana; busqueda: string; conteo?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PESTANAS.map((p) => (
        <Link
          key={p.clave}
          href={`/postventa/agenda?ver=${p.clave}${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ""}`}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
            pestana === p.clave
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground",
          )}
        >
          {p.etiqueta}
        </Link>
      ))}
      {conteo !== undefined && <span className="text-xs text-muted-foreground">{conteo}</span>}
    </div>
  );
}

function FilaAgenda({ servicio: s, alerta }: { servicio: ServicioPostventa; alerta?: boolean }) {
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
function TablaHistorica({ filas, verPrecios }: { filas: ServicioPostventa[]; verPrecios: boolean }) {
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
