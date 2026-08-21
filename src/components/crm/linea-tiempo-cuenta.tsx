"use client";

import Link from "next/link";
import {
  Phone,
  MessageCircle,
  Mail,
  Building2,
  Store,
  Filter,
  StickyNote,
  MoreHorizontal,
  FileText,
  CircleCheckBig,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export const ICONO_ACTIVIDAD: Record<string, LucideIcon> = {
  llamada: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  visita: Building2,
  showroom: Store,
  filtro: Filter,
  nota: StickyNote,
  otro: MoreHorizontal,
};

export const ETIQUETA_ACTIVIDAD: Record<string, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  email: "Correo",
  visita: "Visita",
  showroom: "Showroom",
  filtro: "Filtro",
  nota: "Nota",
  otro: "Otro",
};

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
export interface EventoActividad {
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
  adjuntos?: AdjuntoEvento[];
}
export interface EventoCotizacion {
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
  moneda: string;
  // Solo en las del archivo: el documento ES la cotización, no hay ficha ni
  // acciones detrás, así que la cronología es el único sitio desde donde
  // abrirlo. Las del CRM no lo llevan — viven en su oportunidad, con todas sus
  // acciones. Puede venir null si ese documento no se subió al bucket.
  pdfUrl?: string | null;
}
export interface EventoVenta {
  tipo: "venta";
  id: string;
  fecha: string;
  oportunidadId: string | null;
  monto: number;
  moneda: string;
  // Nº de presupuesto del que salió la venta, cuando viene del Excel histórico.
  presupuesto?: string | null;
  // El documento de ese presupuesto, si está en el archivo y ya subido.
  pdfUrl?: string | null;
}
export type EventoTimeline = EventoActividad | EventoCotizacion | EventoVenta;

function EventoFila({ evento, oportunidadActualId }: { evento: EventoTimeline; oportunidadActualId?: string }) {
  const Icono =
    evento.tipo === "actividad"
      ? (ICONO_ACTIVIDAD[evento.tipoActividad] ?? MoreHorizontal)
      : evento.tipo === "cotizacion"
        ? FileText
        : CircleCheckBig;
  const clasesIcono =
    evento.tipo === "actividad"
      ? "bg-secondary text-foreground"
      : evento.tipo === "cotizacion"
        ? COLOR_COTIZACION[evento.color]
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
          {evento.tipo === "venta" && (
            <span className="font-semibold text-[#1E7F4F]">
              Venta cerrada
              {evento.presupuesto && (
                <span className="font-normal text-muted-foreground"> · presupuesto {evento.presupuesto}</span>
              )}
            </span>
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
          <span className="text-xs text-muted-foreground">
            {new Date(evento.fecha).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
        {evento.tipo === "actividad" && evento.nota && (
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{evento.nota}</p>
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
export function LineaTiempoCuenta({ eventos, oportunidadActualId }: { eventos: EventoTimeline[]; oportunidadActualId?: string }) {
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
          <EventoFila evento={evento} oportunidadActualId={oportunidadActualId} />
        </motion.div>
      ))}
    </div>
  );
}
