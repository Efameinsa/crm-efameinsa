import Link from "next/link";
import { AgendarEnDia, type AtencionPorProgramar } from "@/components/crm/agendar-en-dia";
import { ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import {
  agruparPorDia,
  colorEvento,
  etiquetaEvento,
  type EventoCalendario,
} from "@/lib/calendario-postventa";
import {
  DIAS_CORTOS,
  diasDeSemana,
  diasDelMes,
  lunesDe,
  rotuloDia,
  rotuloMes,
  rotuloSemana,
  sumarDias,
  sumarMes,
} from "@/lib/calendario";
import { cn } from "@/lib/utils";

/**
 * El calendario de atenciones técnicas del área.
 *
 * SEMANA ES LA VISTA POR DEFECTO porque la conversación del 27-08 fue entera en
 * semanas: «¿qué voy a hacer mañana, qué voy a hacer en la semana?». Mes y día
 * están un clic al lado, para el que planifica el trimestre y para el que
 * arranca la mañana.
 *
 * ES UN SERVER COMPONENT, sin una línea de JavaScript: navegar entre semanas
 * son enlaces y filtrar son enlaces. Anda en el celular del técnico con mala
 * señal y no depende de que hidrate nada — el mismo criterio con el que ya
 * estaba hecha la lista de la agenda.
 */

const VISTAS = [
  { clave: "semana", etiqueta: "Semana" },
  { clave: "mes", etiqueta: "Mes" },
  { clave: "dia", etiqueta: "Día" },
] as const;

export type VistaCalendario = (typeof VISTAS)[number]["clave"];

const ZONAS = [
  { clave: "", etiqueta: "Todo" },
  { clave: "lima", etiqueta: "Lima" },
  { clave: "provincia", etiqueta: "Provincia" },
] as const;

export function CalendarioPostventa({
  vista,
  fecha,
  hoy,
  zona,
  eventos,
  porProgramar,
  atencionesPorProgramar,
}: {
  vista: VistaCalendario;
  /** Día ancla: define la semana, el mes o el día que se está mirando. */
  fecha: string;
  hoy: string;
  zona: string;
  eventos: EventoCalendario[];
  porProgramar: { id: string; cliente: string; equipo: string | null; nota: string | null }[];
  /**
   * Las atenciones ya diagnosticadas que esperan día, hora y técnico. Son lo
   * que se puede agendar desde una casilla del calendario: sin esto, la
   * pantalla era de solo lectura y no se podía poner nada en el martes ni en el
   * miércoles (Santos, 31-08).
   */
  atencionesPorProgramar: AtencionPorProgramar[];
}) {
  const porDia = agruparPorDia(eventos);
  const lunes = lunesDe(fecha);
  const mes = fecha.slice(0, 7);

  const enlace = (cambios: { vista?: string; fecha?: string; zona?: string }) => {
    const p = new URLSearchParams({
      ver: "calendario",
      vista: cambios.vista ?? vista,
      fecha: cambios.fecha ?? fecha,
    });
    const z = cambios.zona ?? zona;
    if (z) p.set("zona", z);
    return `/postventa/agenda?${p.toString()}`;
  };

  const anterior = vista === "mes" ? `${sumarMes(mes, -1)}-15` : sumarDias(fecha, vista === "semana" ? -7 : -1);
  const siguiente = vista === "mes" ? `${sumarMes(mes, 1)}-15` : sumarDias(fecha, vista === "semana" ? 7 : 1);
  const rotulo = vista === "semana" ? rotuloSemana(lunes) : vista === "mes" ? rotuloMes(mes) : rotuloDia(fecha);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={enlace({ fecha: anterior })}
          aria-label="Anterior"
          className="rounded-md border border-border p-1.5 hover:bg-accent"
        >
          <ChevronLeft className="size-4" />
        </Link>
        <Link
          href={enlace({ fecha: siguiente })}
          aria-label="Siguiente"
          className="rounded-md border border-border p-1.5 hover:bg-accent"
        >
          <ChevronRight className="size-4" />
        </Link>
        <h3 className="text-sm font-semibold capitalize text-foreground">{rotulo}</h3>
        <Link href={enlace({ fecha: hoy })} className="text-xs font-medium text-primary hover:underline">
          Hoy
        </Link>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {ZONAS.map((z) => (
            <Link
              key={z.clave || "todo"}
              href={enlace({ zona: z.clave })}
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
                zona === z.clave ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {z.etiqueta}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          {VISTAS.map((v) => (
            <Link
              key={v.clave}
              href={enlace({ vista: v.clave })}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
                vista === v.clave ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {v.etiqueta}
            </Link>
          ))}
        </div>
      </div>

      {/* Arriba y no al final: sin fecha, un compromiso desaparece. */}
      {porProgramar.length > 0 && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
            <CalendarClock className="size-3.5" />
            Por programar ({porProgramar.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {porProgramar.slice(0, 12).map((p) => (
              <Link
                key={p.id}
                href={`/postventa/pedidos/${p.id}`}
                className="max-w-[240px] truncate rounded-md border border-amber-300 bg-background px-2 py-1 text-xs text-foreground hover:bg-accent"
                title={[p.cliente, p.equipo, p.nota].filter(Boolean).join(" · ")}
              >
                {p.cliente}
              </Link>
            ))}
            {porProgramar.length > 12 && (
              <Link
                href="/postventa/agenda?ver=lista&estado=sin_fecha"
                className="rounded-md px-2 py-1 text-xs font-medium text-amber-900 underline"
              >
                y {porProgramar.length - 12} más
              </Link>
            )}
          </div>
        </div>
      )}

      {vista === "semana" && <Semana lunes={lunes} hoy={hoy} porDia={porDia} enlace={enlace} porProgramar={atencionesPorProgramar} />}
      {vista === "mes" && <Mes mes={mes} hoy={hoy} porDia={porDia} enlace={enlace} porProgramar={atencionesPorProgramar} />}
      {vista === "dia" && <Dia fecha={fecha} porDia={porDia} porProgramar={atencionesPorProgramar} />}

      <Leyenda />
    </div>
  );
}

function Semana({
  lunes,
  hoy,
  porDia,
  enlace,
  porProgramar,
}: {
  lunes: string;
  hoy: string;
  porDia: Map<string, EventoCalendario[]>;
  enlace: (c: { vista?: string; fecha?: string }) => string;
  porProgramar: AtencionPorProgramar[];
}) {
  const dias = diasDeSemana(lunes);
  return (
    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-6">
      {dias.map((iso) => {
        const eventos = porDia.get(iso) ?? [];
        const esHoy = iso === hoy;
        const [, , dia] = iso.split("-");
        return (
          <div
            key={iso}
            className={cn(
              "min-h-[120px] rounded-lg border p-1.5",
              esHoy ? "border-primary/40 bg-primary/5" : "border-border",
            )}
          >
            <Link
              href={enlace({ vista: "dia", fecha: iso })}
              className="mb-1 flex items-baseline gap-1.5 hover:underline"
            >
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {DIAS_CORTOS[(new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7]}
              </span>
              <span className={cn("text-sm font-semibold tabular-nums", esHoy && "text-primary")}>{Number(dia)}</span>
            </Link>
            <div className="space-y-1">
              {eventos.map((e) => (
                <Tarjeta key={e.clave} evento={e} />
              ))}
            </div>
            <AgendarEnDia fecha={iso} porProgramar={porProgramar} />
          </div>
        );
      })}
    </div>
  );
}

function Mes({
  mes,
  hoy,
  porDia,
  enlace,
  porProgramar,
}: {
  mes: string;
  hoy: string;
  porDia: Map<string, EventoCalendario[]>;
  enlace: (c: { vista?: string; fecha?: string }) => string;
  porProgramar: AtencionPorProgramar[];
}) {
  const dias = diasDelMes(mes);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {DIAS_CORTOS.map((d) => (
            <p key={d} className="text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {d}
            </p>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dias.map((d) => {
            const eventos = porDia.get(d.iso) ?? [];
            const esHoy = d.iso === hoy;
            return (
              <div
                key={d.iso}
                className={cn(
                  "min-h-[86px] rounded-md border p-1",
                  d.otroMes ? "border-transparent bg-muted/30" : esHoy ? "border-primary/40 bg-primary/5" : "border-border",
                )}
              >
                <Link
                  href={enlace({ vista: "dia", fecha: d.iso })}
                  className={cn(
                    "block text-right text-[11px] font-semibold tabular-nums hover:underline",
                    d.otroMes ? "text-muted-foreground/50" : esHoy ? "text-primary" : "text-foreground",
                  )}
                >
                  {d.dia}
                </Link>
                <div className="space-y-0.5">
                  {eventos.slice(0, 3).map((e) => (
                    <Tarjeta key={e.clave} evento={e} compacta />
                  ))}
                  {eventos.length > 3 && (
                    <Link
                      href={enlace({ vista: "dia", fecha: d.iso })}
                      className="block px-1 text-[10px] font-medium text-primary hover:underline"
                    >
                      +{eventos.length - 3} más
                    </Link>
                  )}
                  {!d.otroMes && <AgendarEnDia fecha={d.iso} porProgramar={porProgramar} compacto />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Dia({
  fecha,
  porDia,
  porProgramar,
}: {
  fecha: string;
  porDia: Map<string, EventoCalendario[]>;
  porProgramar: AtencionPorProgramar[];
}) {
  const eventos = porDia.get(fecha) ?? [];
  if (eventos.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Nada agendado para este día.</p>
        <AgendarEnDia fecha={fecha} porProgramar={porProgramar} />
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {eventos.map((e) => (
        <Link
          key={e.clave}
          href={e.href}
          className={cn(
            "flex flex-wrap items-start gap-3 rounded-md border border-l-4 p-2.5 transition-colors hover:bg-accent",
            colorEvento(e.tipo),
            e.hecho && "opacity-60",
          )}
        >
          <span className="w-14 flex-none font-mono text-xs font-semibold tabular-nums text-foreground">
            {e.hora ?? "—"}
          </span>
          <div className="min-w-[200px] flex-1">
            <p className="text-sm font-semibold text-foreground">{e.cliente}</p>
            <p className="text-xs text-muted-foreground">
              {etiquetaEvento(e.tipo)} · {e.titulo}
              {e.ubicacion && ` · ${e.ubicacion}`}
            </p>
          </div>
        </Link>
      ))}
      {/* Un día con algo agendado tiene que dejar agendar más: es el caso
          normal, no la excepción. */}
      <AgendarEnDia fecha={fecha} porProgramar={porProgramar} />
    </div>
  );
}

function Tarjeta({ evento: e, compacta }: { evento: EventoCalendario; compacta?: boolean }) {
  return (
    <Link
      href={e.href}
      title={`${etiquetaEvento(e.tipo)} · ${e.cliente}${e.ubicacion ? ` · ${e.ubicacion}` : ""}`}
      className={cn(
        "block rounded border-l-[3px] px-1.5 py-1 transition-opacity hover:opacity-80",
        colorEvento(e.tipo),
        e.hecho && "opacity-55",
      )}
    >
      <p className="truncate text-[11px] font-semibold leading-tight text-foreground">
        {e.hora && <span className="font-mono tabular-nums">{e.hora} </span>}
        {e.cliente}
      </p>
      {!compacta && (
        <p className="truncate text-[10px] leading-tight text-muted-foreground">
          {e.titulo}
          {e.ubicacion && ` · ${e.ubicacion}`}
        </p>
      )}
    </Link>
  );
}

function Leyenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      {["despacho", "puesta_en_marcha", "mantenimiento", "garantia", "repuesto"].map((t) => (
        <span key={t} className="flex items-center gap-1">
          <span className={cn("inline-block h-2.5 w-2.5 rounded-sm border-l-[3px]", colorEvento(t))} />
          {etiquetaEvento(t)}
        </span>
      ))}
    </div>
  );
}
