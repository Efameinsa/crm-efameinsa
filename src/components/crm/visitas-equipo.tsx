import { Building2, CalendarClock, MapPin, Video } from "lucide-react";
import Link from "@/components/enlace";
import { DIAS_CORTOS } from "@/lib/calendario";
import {
  contarVisitasEquipo,
  ETIQUETA_CLASE,
  ETIQUETA_ESTADO,
  type ClaseVisita,
  type EstadoVisita,
  type VisitaEquipo,
} from "@/lib/visitas-equipo";
import { cn } from "@/lib/utils";

/**
 * «Visitas del equipo» en Supervisión, y las del comercial en su detalle (ing.
 * Carlos, reunión 01-10 11:05: «lo que no vi es la bendita visitas, no sé
 * dónde están… de cada agenda comercial no vi»). Los contadores ya estaban
 * arriba (indicadores del 30-09); esto es la LISTA detrás de esos números:
 * quién visita a quién, qué día y hora, dónde, y si se hizo. Agrupada por
 * comercial, la semana entera (lunes a domingo) con el día elegido resaltado.
 * El estado va EN PALABRAS, no solo en color (se imprime en blanco y negro).
 */

const ESTILO_ESTADO: Record<EstadoVisita, string> = {
  hecha: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  pendiente: "bg-[#4A6670]/10 text-[#4A6670]",
  vencida: "bg-primary/10 text-primary",
  cancelada: "bg-secondary text-muted-foreground",
  no_concretada: "bg-amber-500/10 text-amber-700",
};

const ICONO_CLASE: Record<ClaseVisita, typeof Video> = {
  visita: MapPin,
  videollamada: Video,
  planta: Building2,
};

function diaCorto(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DIAS_CORTOS[(d.getUTCDay() + 6) % 7]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function Fila({ v, resaltada, hoy }: { v: VisitaEquipo; resaltada: boolean; hoy: string }) {
  const Icono = ICONO_CLASE[v.clase];
  return (
    <li className={cn("grid gap-x-3 gap-y-0.5 px-3 py-2 text-xs sm:grid-cols-[6.5rem_1fr_auto]", resaltada && "bg-primary/[0.04]")}>
      <div className="tabular-nums text-muted-foreground">
        <span className={cn("font-semibold", v.fecha === hoy ? "text-foreground" : "")}>{diaCorto(v.fecha)}</span>
        <span className="ml-1.5">{v.hora ?? "s/h"}</span>
      </div>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-1.5">
          <Icono className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-[11px] font-medium text-muted-foreground">{ETIQUETA_CLASE[v.clase]}</span>
          <span aria-hidden className="text-muted-foreground">·</span>
          {v.cuentaId ? (
            <Link href={`/gerencia/clientes/${v.cuentaId}`} className="font-semibold text-foreground hover:text-primary hover:underline">
              {v.cliente}
            </Link>
          ) : (
            <span className="font-semibold text-foreground">{v.cliente}</span>
          )}
        </p>
        {v.lugar && <p className="truncate text-muted-foreground">{v.lugar}</p>}
        {v.detalle && <p className="line-clamp-2 text-muted-foreground/90">{v.detalle}</p>}
        <p className="text-[10px] text-muted-foreground">
          {v.origen === "agenda" && "Agendada como próxima acción"}
          {v.origen === "tarea" && "Tarea de la agenda"}
          {v.origen === "planta" && "Anunciada a Central (visita a planta)"}
          {v.origen === "gestion" && "Registrada sin haberse agendado"}
          {v.hechaEl && v.origen !== "gestion" && ` · registrada el ${diaCorto(v.hechaEl.fecha)} ${v.hechaEl.hora}`}
        </p>
      </div>
      <div className="sm:text-right">
        <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight", ESTILO_ESTADO[v.estado])}>
          {ETIQUETA_ESTADO[v.estado]}
        </span>
        {v.estadoNota && <p className="mt-0.5 max-w-[14rem] text-[10px] text-muted-foreground sm:ml-auto">{v.estadoNota}</p>}
      </div>
    </li>
  );
}

function Resumen({ lista }: { lista: VisitaEquipo[] }) {
  const c = contarVisitasEquipo(lista);
  return (
    <span className="tabular-nums">
      {c.programadas} agendada{c.programadas === 1 ? "" : "s"} · {c.hechas} hecha{c.hechas === 1 ? "" : "s"}
      {c.pendientes > 0 && ` · ${c.pendientes} pendiente${c.pendientes === 1 ? "" : "s"}`}
      {c.vencidas > 0 && (
        <b className="font-semibold text-primary">
          {" "}
          · {c.vencidas} vencida{c.vencidas === 1 ? "" : "s"} sin registrar
        </b>
      )}
    </span>
  );
}

export function VisitasEquipo({
  lista,
  nombres,
  orden,
  fecha,
  desde,
  hasta,
  hoy,
  unComercial = false,
}: {
  lista: VisitaEquipo[];
  /** id → «C2 · Moisés Baldeón». */
  nombres: Map<string, string>;
  /** Orden de los grupos (el de las tarjetas de arriba). */
  orden?: string[];
  /** El día elegido en el filtro: se resalta. */
  fecha: string;
  desde: string;
  hasta: string;
  hoy: string;
  /** En el detalle de un comercial no hace falta agrupar. */
  unComercial?: boolean;
}) {
  const delDia = lista.filter((v) => v.fecha === fecha);
  const grupos = new Map<string, VisitaEquipo[]>();
  for (const id of orden ?? []) grupos.set(id, []);
  for (const v of lista) {
    const l = grupos.get(v.comercialId) ?? [];
    l.push(v);
    grupos.set(v.comercialId, l);
  }
  const conVisitas = [...grupos.entries()].filter(([, l]) => l.length > 0);
  const sinVisitas = [...grupos.entries()].filter(([, l]) => l.length === 0).map(([id]) => nombres.get(id) ?? "—");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5" aria-hidden />
          Semana del {diaCorto(desde)} al {diaCorto(hasta)}: <Resumen lista={lista} />
        </p>
        <p>
          El {diaCorto(fecha)}: <Resumen lista={delDia} />
        </p>
      </div>

      {conVisitas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          {unComercial ? "Este comercial no tiene" : "Nadie del equipo tiene"} visitas ni videollamadas agendadas o registradas esta semana.
        </p>
      ) : (
        conVisitas.map(([id, l]) => (
          <div key={id} className="overflow-hidden rounded-lg border border-border">
            {!unComercial && (
              <p className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-secondary/40 px-3 py-1.5 text-xs">
                <b className="font-semibold text-foreground">{nombres.get(id) ?? "Otro usuario"}</b>
                <span className="text-muted-foreground">
                  <Resumen lista={l} />
                </span>
              </p>
            )}
            <ul className="divide-y divide-border">
              {l.map((v) => (
                <Fila key={v.clave} v={v} resaltada={v.fecha === fecha} hoy={hoy} />
              ))}
            </ul>
          </div>
        ))
      )}

      {!unComercial && sinVisitas.length > 0 && (
        <p className="text-[11px] text-muted-foreground">Sin visitas ni videollamadas esta semana: {sinVisitas.join(", ")}.</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Agendadas: la próxima acción de la agenda del comercial cuando dice visita o videollamada, sus tareas de agenda y las visitas a planta
        anunciadas a Central. Hechas: las gestiones registradas como Visita, Videollamada o Showroom; si calzan con algo agendado, lo dan por
        hecho. «Vencida sin registrar» = el día pasó y no hay gestión. «Cancelada» = se cambió por otra acción o se anuló.
      </p>
    </div>
  );
}
