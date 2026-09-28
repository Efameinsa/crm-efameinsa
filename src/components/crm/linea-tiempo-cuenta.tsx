"use client";

import Link from "next/link";
import { MoreHorizontal, FileText, CircleCheckBig, CalendarClock, Wrench, Inbox } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { textoLegible } from "@/lib/texto";
import { fechaAgendada, fechaConHora } from "@/lib/fechas";
import { ETIQUETA_ACTIVIDAD, ICONO_ACTIVIDAD } from "@/components/crm/etiquetas-actividad";
import { TipoExpedienteBadge } from "@/components/crm/tipo-expediente-badge";
import { SolicitudLead } from "@/components/crm/solicitud-lead";

// Se re-exportan para no tocar a quien ya las importaba desde acá.
export { ETIQUETA_ACTIVIDAD, ICONO_ACTIVIDAD };

export const COLOR_COTIZACION: Record<"ambar" | "verde" | "rojo" | "neutro", string> = {
  ambar: "bg-amber-500/10 text-amber-700",
  verde: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  rojo: "bg-destructive/10 text-destructive",
  // Las cotizaciones del archivo (anteriores al CRM) se pintan en gris: son
  // historia, no algo sobre lo que se pueda actuar.
  neutro: "bg-secondary text-muted-foreground",
};

export interface ResultadoGestionEvento {
  codigo: string;
  nombre: string;
}

export interface AdjuntoEvento {
  nombre: string;
  url: string; // URL firmada de Storage (bucket privado 'adjuntos'), vence en 1 h
}
/**
 * A QUÉ EXPEDIENTE PERTENECE CADA FILA (gerencia, 28-09). «El cliente es uno
 * solo… pero hay un caso de cotización, hay un caso de problema técnico. Eso sí
 * tiene que estar separado». Con esto la ficha pinta cada fila con el color de
 * su expediente y el expediente muestra solo lo suyo. `expediente` es el id
 * crudo (aunque sea un cascarón del Excel, que no navega); `expedienteTipo`
 * es su tipo de postventa, o null si es un expediente comercial.
 */
export interface DelExpediente {
  expediente?: string | null;
  expedienteTipo?: string | null;
}

export interface EventoActividad extends DelExpediente {
  tipo: "actividad";
  id: string;
  fecha: string;
  // null cuando la oportunidad no es un sitio de trabajo: las que importó el
  // Excel son un cascarón sin etapa ni acciones, y su pantalla solo repite
  // esta misma historia. Entonces la fila no navega a ninguna parte.
  oportunidadId: string | null;
  tipoActividad: string;
  nota: string | null;
  resultado: ResultadoGestionEvento | null;
  /** Quién la registró, con su código (Carlos, 22-09). */
  quien?: string | null;
  adjuntos?: AdjuntoEvento[];
  // A qué se comprometió el comercial en ESTA gestión (migración 0056).
  // null en todo lo anterior al 24-08 y en las gestiones sin próxima acción.
  proximaAccion?: string | null;
  proximaAccionAt?: string | null;
  proximaAccionHora?: string | null;
}
export interface EventoCotizacion extends DelExpediente {
  tipo: "cotizacion";
  id: string;
  fecha: string;
  // null en las del archivo (se emitieron antes del CRM, no cuelgan de
  // ninguna oportunidad) y también cuando la oportunidad es un cascarón del
  // Excel: en los dos casos no hay adónde navegar.
  oportunidadId: string | null;
  codigo: string | null;
  estadoLabel: string;
  color: "ambar" | "verde" | "rojo" | "neutro";
  // null cuando el documento no imprimió un total (muchas cotizaciones son un
  // menú de alternativas): se muestra el presupuesto sin cifra, no un cero.
  monto: number | null;
  /** La cifra existe pero no se muestra a quien mira (postventa, 0221). */
  montoReservado?: boolean;
  moneda: string;
  // Solo en las del archivo: el documento ES la cotización, no hay ficha ni
  // acciones detrás, así que la cronología es el único sitio desde donde
  // abrirlo. Las del CRM no lo llevan — viven en su oportunidad, con todas sus
  // acciones. Puede venir null si ese documento no se subió al bucket.
  pdfUrl?: string | null;
}
export interface EventoVenta extends DelExpediente {
  tipo: "venta";
  id: string;
  fecha: string;
  oportunidadId: string | null;
  /** null cuando la historia se mira sin montos (postventa, 0221). */
  monto: number | null;
  moneda: string;
  // Anulada por gerencia: se queda en el historial porque pasó, pero no se
  // lee como una venta buena (reunión 28-08).
  anulada?: boolean;
  // Nº de presupuesto del que salió la venta, cuando viene del Excel histórico.
  presupuesto?: string | null;
  // El documento de ese presupuesto, si está en el archivo y ya subido.
  pdfUrl?: string | null;
}
/**
 * Lo que hizo POSTVENTA con el cliente: un servicio (mantenimiento, garantía,
 * repuesto, despacho) o una atención. Va en la misma cronología porque el
 * comercial y postventa venden mantenimiento los dos y cada uno tiene que ver
 * lo que hizo el otro (Santos, 02-09).
 */
export interface EventoServicio extends DelExpediente {
  tipo: "servicio";
  id: string;
  fecha: string;
  titulo: string;
  detalle: string | null;
  quien: string | null;
  href: string | null;
  monto?: number | null;
  moneda?: string | null;
  /** Nunca cuelga de una oportunidad comercial: es trabajo de postventa. */
  oportunidadId: null;
  pdfUrl?: null;
}
/**
 * EL INICIO DEL EXPEDIENTE: lo que el cliente pidió, tal como lo registró
 * Central (gerencia, 28-09, con MINERÍA SINGULARIDAD). Estaba clavado arriba
 * del expediente y se leía como si fuera la última gestión: «ese primer
 * registro debería ir abajo en la cola… como punto de partida… con su
 * respectiva hora… que tenga un color especial… ¿y quién registró?». Ahora es
 * una fila más, en su hora, con su color y con quién lo registró.
 */
export interface EventoSolicitud extends DelExpediente {
  tipo: "solicitud";
  id: string;
  fecha: string;
  oportunidadId: string | null;
  mensaje: string | null;
  canal: string;
  codigo: string | null;
  /** Quién lo registró en Central (o el comercial que lo pasó). */
  quien: string | null;
  /** Nombre · teléfono · correo que dejó el cliente en ESTA solicitud (0236). */
  dejo: string | null;
  adjuntos?: AdjuntoEvento[];
  /** El cliente volvió a escribir y se sumó a este expediente (0141). */
  volvio?: boolean;
  monto?: null;
  pdfUrl?: null;
}
export type EventoTimeline = EventoActividad | EventoCotizacion | EventoVenta | EventoServicio | EventoSolicitud;

export const ETIQUETA_CANAL_SOLICITUD: Record<string, string> = {
  whatsapp: "WhatsApp",
  llamada: "llamada",
  formulario_web: "el formulario de la web",
  facebook: "Facebook",
  instagram: "Instagram",
  email: "correo",
  presencial: "visita presencial",
  referido: "referido",
  otro: "otro canal",
};

/** El recuadro de la solicitud: el mismo en la tabla y en la línea de tiempo. */
export function CuerpoSolicitud({ evento }: { evento: EventoSolicitud }) {
  return (
    <div>
      <p className="text-sm font-semibold text-[#7E1210] dark:text-rose-300">
        {evento.volvio ? "El cliente volvió a escribir" : "Inicio · lo que solicitó el cliente"}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
          · entró por {ETIQUETA_CANAL_SOLICITUD[evento.canal] ?? evento.canal}
          {evento.codigo ? ` · ${evento.codigo}` : ""}
          {evento.quien ? ` · lo registró ${evento.quien}` : ""}
        </span>
      </p>
      {evento.mensaje ? (
        <div className="mt-1"><SolicitudLead mensaje={evento.mensaje} compacto /></div>
      ) : (
        <p className="mt-0.5 text-sm italic text-muted-foreground">Central no escribió qué pidió el cliente.</p>
      )}
      {evento.dejo && <p className="mt-1 text-xs text-muted-foreground">Dejó: {evento.dejo}</p>}
      {(evento.adjuntos ?? []).length > 0 && (
        <p className="mt-1 flex flex-wrap gap-2">
          {evento.adjuntos!.map((ad, i) => (
            <a
              key={i}
              href={ad.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
            >
              📎 {ad.nombre}
            </a>
          ))}
        </p>
      )}
    </div>
  );
}

function EventoFila({ evento, oportunidadActualId }: { evento: EventoTimeline; oportunidadActualId?: string }) {
  if (evento.tipo === "solicitud") {
    return (
      <div className="relative flex gap-3">
        <span className="flex size-8 flex-none items-center justify-center rounded-full bg-[#7E1210]/10 text-[#7E1210]">
          <Inbox className="size-4" />
        </span>
        <div className="min-w-0 flex-1 rounded-lg border border-[#7E1210]/30 bg-[#7E1210]/5 p-2">
          <CuerpoSolicitud evento={evento} />
          <p className="mt-1 text-xs text-muted-foreground">{fechaConHora(evento.fecha)}</p>
        </div>
      </div>
    );
  }
  const Icono =
    evento.tipo === "actividad"
      ? (ICONO_ACTIVIDAD[evento.tipoActividad] ?? MoreHorizontal)
      : evento.tipo === "cotizacion"
        ? FileText
        : evento.tipo === "servicio"
          ? Wrench
          : CircleCheckBig;
  const clasesIcono =
    evento.tipo === "actividad"
      ? "bg-secondary text-foreground"
      : evento.tipo === "cotizacion"
        ? COLOR_COTIZACION[evento.color]
        : evento.tipo === "servicio"
          ? "bg-sky-100 text-sky-900"
          : "bg-[#1E7F4F]/10 text-[#1E7F4F]";

  return (
    <div className="relative flex gap-3">
      <span className={cn("flex size-8 flex-none items-center justify-center rounded-full", clasesIcono)}>
        <Icono className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          {evento.tipo === "actividad" && (
            <span className="font-semibold text-foreground">
              {ETIQUETA_ACTIVIDAD[evento.tipoActividad] ?? evento.tipoActividad}
            </span>
          )}
          {evento.tipo === "cotizacion" && (
            <span className="font-semibold text-foreground">
              Cotización {evento.codigo ?? "—"} {evento.estadoLabel}
            </span>
          )}
          {evento.tipo === "servicio" && (
            <span className="font-semibold text-sky-900">
              {evento.href ? (
                <Link href={evento.href} className="hover:underline">
                  {evento.titulo}
                </Link>
              ) : (
                evento.titulo
              )}
              {evento.quien && <span className="font-normal text-muted-foreground"> · postventa: {evento.quien}</span>}
            </span>
          )}
          {evento.tipo === "venta" && (
            <span className={evento.anulada ? "font-semibold text-muted-foreground line-through" : "font-semibold text-[#1E7F4F]"}>
              {evento.anulada ? "Venta anulada" : "Venta cerrada"}
              {evento.presupuesto && (
                <span className="font-normal text-muted-foreground"> · presupuesto {evento.presupuesto}</span>
              )}
            </span>
          )}
          {evento.tipo === "servicio" && evento.detalle && (
            <span className="basis-full text-xs text-muted-foreground">{evento.detalle}</span>
          )}
          {evento.tipo !== "actividad" && evento.monto != null && (
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {evento.moneda} {evento.monto.toLocaleString("es-PE")}
            </span>
          )}
          {evento.tipo === "actividad" && evento.resultado && (
            <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground">
              {evento.resultado.nombre}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{fechaConHora(evento.fecha)}</span>
        </div>
        {evento.tipo === "actividad" && evento.nota && (
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{textoLegible(evento.nota)}</p>
        )}
        {evento.tipo === "actividad" && evento.proximaAccion && (
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs text-foreground">
            <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
            <span>
              <span className="text-muted-foreground">Sigue: </span>
              {evento.proximaAccion}
              {evento.proximaAccionAt && (
                <span className="text-muted-foreground"> — {fechaAgendada(evento.proximaAccionAt, evento.proximaAccionHora)}</span>
              )}
            </span>
          </p>
        )}
        {evento.tipo === "actividad" && (evento.adjuntos ?? []).length > 0 && (
          <p className="mt-1 flex flex-wrap gap-2">
            {evento.adjuntos!.map((ad, i) => (
              <a
                key={i}
                href={ad.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
              >
                📎 {ad.nombre}
              </a>
            ))}
          </p>
        )}
        {evento.tipo !== "actividad" && evento.pdfUrl && (
          <p className="mt-1">
            <a
              href={evento.pdfUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
            >
              <FileText className="size-3" />
              {evento.tipo === "venta" ? "Ver el presupuesto" : "Ver PDF"}
            </a>
          </p>
        )}
        {evento.oportunidadId != null && evento.oportunidadId !== oportunidadActualId && (
          <Link
            href={`/comercial/oportunidades/${evento.oportunidadId}`}
            className="mt-0.5 inline-block text-xs text-primary hover:underline"
          >
            Ver oportunidad
          </Link>
        )}
      </div>
    </div>
  );
}

// Renderiza la lista que le pasen, sin paginar ni filtrar — eso lo maneja
// HistorialCuenta (dueño del estado de orden/filtro/expansión compartido
// entre esta vista y la de tabla).
export function LineaTiempoCuenta({
  eventos,
  oportunidadActualId,
  conExpediente,
}: {
  eventos: EventoTimeline[];
  oportunidadActualId?: string;
  /** En la ficha: cada evento lleva la etiqueta de color de su expediente (28-09). */
  conExpediente?: boolean;
}) {
  const reducido = useReducedMotion();

  return (
    <div className="space-y-4">
      {eventos.map((evento, i) => (
        <motion.div
          key={`${evento.tipo}-${evento.id}`}
          initial={reducido ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative"
        >
          {i < eventos.length - 1 && (
            <span className="absolute left-[15px] top-8 h-[calc(100%-4px)] w-px bg-border" aria-hidden />
          )}
          {conExpediente && evento.expediente && (
            <div className="mb-1 pl-11">
              <TipoExpedienteBadge tipo={evento.expedienteTipo} />
            </div>
          )}
          <EventoFila evento={evento} oportunidadActualId={oportunidadActualId} />
        </motion.div>
      ))}
    </div>
  );
}
