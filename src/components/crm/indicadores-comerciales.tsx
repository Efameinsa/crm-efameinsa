import { Building2, MessageCircle, PhoneCall, Video } from "lucide-react";
import {
  esDiaEnCurso,
  evaluarVisitas,
  evaluarWhatsapp,
  type ConteoVisitas,
  type EstadoIndicador,
  type Evaluacion,
  type IndicadoresComercial,
  type IndicadoresEquipo,
  type ResumenWhatsapp,
} from "@/lib/indicadores-comerciales";
import { cn } from "@/lib/utils";

/**
 * Los indicadores del comercial, con el mismo lenguaje en todas las pantallas
 * (ing. Carlos, 30-09: «esos dos puntos tienen que estar en su reporte diario,
 * reporte semanal, reporte mensual, todo… para ellos y de cara a gerencia
 * comercial»). Cuatro tarjetas: número grande, «de N», barra y el estado EN
 * PALABRAS —el color solo no alcanza: se imprime en blanco y negro—. La
 * comparación con la semana anterior va chica, abajo. Nada de gráficos.
 */

const ESTILO_ESTADO: Record<EstadoIndicador, { pill: string; barra: string }> = {
  en_meta: { pill: "bg-[#1E7F4F]/10 text-[#1E7F4F]", barra: "bg-[#1E7F4F]" },
  en_camino: { pill: "bg-amber-500/10 text-amber-700", barra: "bg-amber-500" },
  atrasado: { pill: "bg-primary/10 text-primary", barra: "bg-primary" },
  en_medicion: { pill: "bg-secondary text-muted-foreground", barra: "bg-[#4A6670]" },
  sin_meta: { pill: "bg-secondary text-muted-foreground", barra: "bg-[#4A6670]" },
};

export function PildoraEstado({ evaluacion, className }: { evaluacion: Evaluacion; className?: string }) {
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight", ESTILO_ESTADO[evaluacion.estado].pill, className)}>
      {evaluacion.texto}
    </span>
  );
}

function Barra({ valor, meta, estado }: { valor: number; meta: number; estado: EstadoIndicador }) {
  const pct = meta > 0 ? Math.min(100, Math.round((valor / meta) * 100)) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", ESTILO_ESTADO[estado].barra)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function TarjetaIndicador({
  etiqueta,
  icono: Icono,
  valor,
  meta,
  unidadMeta,
  evaluacion,
  detalle,
  comparacion,
}: {
  etiqueta: string;
  icono: typeof Video;
  valor: number;
  meta: number | null;
  unidadMeta?: string;
  evaluacion: Evaluacion | null;
  detalle?: React.ReactNode;
  comparacion?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <small className="flex items-start gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icono className="size-3.5 shrink-0" aria-hidden />
        <span className="leading-tight">{etiqueta}</span>
      </small>
      <p className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold tabular-nums tracking-tight text-foreground">{valor}</span>
        {meta !== null && (
          <span className="text-xs text-muted-foreground">
            de {meta}
            {unidadMeta ? ` ${unidadMeta}` : ""}
          </span>
        )}
      </p>
      {meta !== null && meta > 0 && <Barra valor={valor} meta={meta} estado={evaluacion?.estado ?? "sin_meta"} />}
      {detalle && <div className="text-[11px] leading-snug text-muted-foreground">{detalle}</div>}
      {evaluacion && (
        <div>
          <PildoraEstado evaluacion={evaluacion} />
        </div>
      )}
      {comparacion && <p className="mt-auto text-[10px] text-muted-foreground/80">{comparacion}</p>}
    </div>
  );
}

function detalleVisitas(c: ConteoVisitas): string | null {
  if (c.visitas === 0) return null;
  const partes = [];
  if (c.visitasCliente) partes.push(`${c.visitasCliente} al cliente`);
  if (c.visitasPlanta) partes.push(`${c.visitasPlanta} a planta`);
  return partes.join(" · ");
}

export function lineaWhatsapp(w: ResumenWhatsapp): string {
  const partes = [`${w.calificadosMismoDia} de ${w.chats} calificado${w.chats === 1 ? "" : "s"} el mismo día`];
  if (w.medianaRespuestaMin !== null) partes.push(`responde en ${w.medianaRespuestaMin} min`);
  if (w.sinResponder > 0) partes.push(`${w.sinResponder} sin responder`);
  const resultado = [w.interesados && `${w.interesados} interesado${w.interesados === 1 ? "" : "s"}`, w.cotizados && `${w.cotizados} cotizado${w.cotizados === 1 ? "" : "s"}`].filter(Boolean);
  if (resultado.length) partes.push(resultado.join(", "));
  return partes.join(" · ");
}

/** ¿El rango de visitas es una semana (o un día dentro de ella)? */
function esSemana(eq: IndicadoresEquipo): boolean {
  const dias = (new Date(`${eq.hasta}T00:00:00Z`).getTime() - new Date(`${eq.desde}T00:00:00Z`).getTime()) / 86_400_000 + 1;
  return dias <= 7;
}

/**
 * La fila de cuatro tarjetas del comercial. `gestiones` es lo del día (o del
 * período) contra su meta; si no viene, la primera tarjeta no se dibuja.
 */
export function FilaIndicadores({
  eq,
  c,
  gestiones,
  rotuloWhatsapp = "WhatsApp de campaña · hoy",
}: {
  eq: IndicadoresEquipo;
  c: IndicadoresComercial;
  gestiones?: { hechas: number; meta: number; rotulo: string } | null;
  rotuloWhatsapp?: string;
}) {
  const { visitas, videollamadas } = evaluarVisitas(eq, c);
  const w = c.whatsapp;
  const estadoWa = evaluarWhatsapp(w, eq.metas, esDiaEnCurso(eq));
  const periodo = esSemana(eq) ? "de la semana" : "del período";
  const anterior = esSemana(eq) ? "la semana pasada" : "el período anterior";
  const evGestiones = gestiones
    ? gestiones.hechas >= gestiones.meta
      ? ({ estado: "en_meta", texto: `En meta: ${gestiones.hechas} de ${gestiones.meta}` } as Evaluacion)
      : esDiaEnCurso(eq)
        ? ({ estado: "sin_meta", texto: `Faltan ${gestiones.meta - gestiones.hechas} para la meta` } as Evaluacion)
        : ({ estado: "atrasado", texto: `No llegó: ${gestiones.hechas} de ${gestiones.meta}` } as Evaluacion)
    : null;

  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:gap-3", gestiones ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {gestiones && (
        <TarjetaIndicador
          etiqueta={gestiones.rotulo}
          icono={PhoneCall}
          valor={gestiones.hechas}
          meta={gestiones.meta}
          evaluacion={evGestiones}
          detalle="Sin el WhatsApp de campaña"
        />
      )}
      <TarjetaIndicador
        etiqueta={rotuloWhatsapp}
        icono={MessageCircle}
        valor={w.chats}
        meta={null}
        evaluacion={estadoWa}
        detalle={
          w.chats === 0 ? (
            "No le llegaron chats de anuncio: no hay nada que medir."
          ) : (
            <>
              chat{w.chats === 1 ? "" : "s"} de anuncio · {lineaWhatsapp(w)}
              {w.fueraDeHorario > 0 && <> · {w.fueraDeHorario} fuera de horario</>}
            </>
          )
        }
        comparacion={w.chats > 0 ? `Metas: ${eq.metas.waCalificadosPct} % calificados el mismo día · responder en ${eq.metas.waRespuestaMin} min` : null}
      />
      <TarjetaIndicador
        etiqueta={`Visitas ${periodo}`}
        icono={Building2}
        valor={c.periodo.visitas}
        meta={eq.metaVisitas}
        evaluacion={visitas}
        detalle={detalleVisitas(c.periodo) ?? "Al cliente, o el cliente a la planta"}
        comparacion={`${c.anterior.visitas} ${anterior}`}
      />
      <TarjetaIndicador
        etiqueta={`Videollamadas ${periodo}`}
        icono={Video}
        valor={c.periodo.videollamadas}
        meta={eq.metaVideollamadas}
        evaluacion={videollamadas}
        comparacion={`${c.anterior.videollamadas} ${anterior}`}
      />
    </div>
  );
}

/** Para la tarjeta de Control: dos líneas compactas debajo de la de gestiones. */
export function LineasIndicadoresSupervision({ eq, c }: { eq: IndicadoresEquipo; c: IndicadoresComercial }) {
  const { visitas, videollamadas } = evaluarVisitas(eq, c);
  const w = c.whatsapp;
  const estadoWa = evaluarWhatsapp(w, eq.metas, esDiaEnCurso(eq));
  return (
    <div className="mt-2 space-y-1.5 border-t border-dashed border-border pt-2 text-[11px] text-muted-foreground">
      {/* WhatsApp de campaña: solo si le llegaron chats de anuncio. Sin chats,
          nada que medir y nadie en rojo por no tener campaña (coordinador, 30-09). */}
      {w.chats > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <MessageCircle className="size-3 shrink-0 text-[#25A366]" aria-hidden />
          <b className="font-semibold text-foreground">
            WhatsApp de campaña: {w.chats} chat{w.chats === 1 ? "" : "s"}
          </b>
          <span>{lineaWhatsapp(w)}</span>
          {estadoWa && <PildoraEstado evaluacion={estadoWa} />}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <Building2 className="size-3 shrink-0" aria-hidden />
        <b className="font-semibold tabular-nums text-foreground">
          Visitas {c.periodo.visitas}/{eq.metaVisitas}
        </b>
        <span>en la semana{c.dia.visitas > 0 ? ` (${c.dia.visitas} hoy)` : ""}</span>
        <PildoraEstado evaluacion={visitas} />
      </p>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <Video className="size-3 shrink-0" aria-hidden />
        <b className="font-semibold tabular-nums text-foreground">
          Videollamadas {c.periodo.videollamadas}/{eq.metaVideollamadas}
        </b>
        <span>en la semana{c.dia.videollamadas > 0 ? ` (${c.dia.videollamadas} hoy)` : ""}</span>
        <PildoraEstado evaluacion={videollamadas} />
      </p>
    </div>
  );
}

/**
 * «¿Cuántas visitas hay el día de hoy?» (ing. Carlos, 30-09). Una línea para
 * todo el equipo, con quién las hizo.
 */
export function ResumenEquipoHoy({
  eq,
  nombres,
  programadasPlanta,
  esHoy,
}: {
  eq: IndicadoresEquipo;
  /** id → código corto (C1, C5…) para decir quién. */
  nombres: Map<string, string>;
  programadasPlanta: number;
  esHoy: boolean;
}) {
  const quien = (campo: keyof ConteoVisitas) => {
    const lista = [...eq.porComercial.values()]
      .filter((c) => c.dia[campo] > 0)
      .map((c) => `${nombres.get(c.id) ?? "?"}${c.dia[campo] > 1 ? ` ×${c.dia[campo]}` : ""}`);
    return lista.length ? ` (${lista.join(", ")})` : "";
  };
  const total = (campo: keyof ConteoVisitas) => [...eq.porComercial.values()].reduce((s, c) => s + c.dia[campo], 0);
  const chats = [...eq.porComercial.values()].reduce((s, c) => s + c.whatsapp.chats, 0);
  const calificados = [...eq.porComercial.values()].reduce((s, c) => s + c.whatsapp.calificadosMismoDia, 0);
  const visitas = total("visitas");
  const videollamadas = total("videollamadas");

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{esHoy ? "Hoy en el equipo" : "Ese día en el equipo"}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-foreground">
        <span>
          <Building2 className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" aria-hidden />
          <b className="tabular-nums">{visitas}</b> visita{visitas === 1 ? "" : "s"}
          <span className="text-muted-foreground">{quien("visitas")}</span>
        </span>
        <span>
          <Video className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" aria-hidden />
          <b className="tabular-nums">{videollamadas}</b> videollamada{videollamadas === 1 ? "" : "s"}
          <span className="text-muted-foreground">{quien("videollamadas")}</span>
        </span>
        <span>
          <MessageCircle className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" aria-hidden />
          <b className="tabular-nums">{chats}</b> chat{chats === 1 ? "" : "s"} de campaña, <b className="tabular-nums">{calificados}</b> calificado
          {calificados === 1 ? "" : "s"}
        </span>
      </p>
      {programadasPlanta > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {programadasPlanta} visita{programadasPlanta === 1 ? "" : "s"} a planta programada{programadasPlanta === 1 ? "" : "s"} para {esHoy ? "hoy" : "ese día"} todavía sin cerrar: cuentan cuando
          quien la atendió la cierra con su resultado.
        </p>
      )}
    </div>
  );
}

