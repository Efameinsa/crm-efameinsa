"use client";

import { useState } from "react";
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

const ICONO_ACTIVIDAD: Record<string, LucideIcon> = {
  llamada: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  visita: Building2,
  showroom: Store,
  filtro: Filter,
  nota: StickyNote,
  otro: MoreHorizontal,
};

const ETIQUETA_ACTIVIDAD: Record<string, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  email: "Correo",
  visita: "Visita",
  showroom: "Showroom",
  filtro: "Filtro",
  nota: "Nota",
  otro: "Otro",
};

const COLOR_COTIZACION: Record<"ambar" | "verde" | "rojo", string> = {
  ambar: "bg-amber-500/10 text-amber-700",
  verde: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  rojo: "bg-destructive/10 text-destructive",
};

export interface EventoActividad {
  tipo: "actividad";
  id: string;
  fecha: string;
  oportunidadId: string;
  tipoActividad: string;
  nota: string | null;
}
export interface EventoCotizacion {
  tipo: "cotizacion";
  id: string;
  fecha: string;
  oportunidadId: string;
  codigo: string | null;
  estadoLabel: string;
  color: "ambar" | "verde" | "rojo";
  monto: number;
  moneda: string;
}
export interface EventoVenta {
  tipo: "venta";
  id: string;
  fecha: string;
  oportunidadId: string;
  monto: number;
  moneda: string;
}
export type EventoTimeline = EventoActividad | EventoCotizacion | EventoVenta;

const MOSTRADOS_INICIAL = 25;

function EventoFila({ evento }: { evento: EventoTimeline }) {
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
          {evento.tipo === "venta" && <span className="font-semibold text-[#1E7F4F]">Venta cerrada</span>}
          {evento.tipo !== "actividad" && (
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {evento.moneda} {evento.monto.toLocaleString("es-PE")}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {new Date(evento.fecha).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
        {evento.tipo === "actividad" && evento.nota && (
          <p className="mt-0.5 text-sm text-muted-foreground">{evento.nota}</p>
        )}
        <Link
          href={`/comercial/oportunidades/${evento.oportunidadId}`}
          className="mt-0.5 inline-block text-xs text-primary hover:underline"
        >
          Ver oportunidad
        </Link>
      </div>
    </div>
  );
}

export function LineaTiempoCuenta({ eventos }: { eventos: EventoTimeline[] }) {
  const [expandido, setExpandido] = useState(false);
  const reducido = useReducedMotion();

  if (eventos.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin historial registrado para este cliente todavía.</p>;
  }

  const visibles = expandido ? eventos : eventos.slice(0, MOSTRADOS_INICIAL);
  const restantes = eventos.length - visibles.length;

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {visibles.map((evento, i) => (
          <motion.div
            key={`${evento.tipo}-${evento.id}`}
            initial={reducido ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative"
          >
            {i < visibles.length - 1 && (
              <span className="absolute left-[15px] top-8 h-[calc(100%-4px)] w-px bg-border" aria-hidden />
            )}
            <EventoFila evento={evento} />
          </motion.div>
        ))}
      </div>
      {restantes > 0 && (
        <button
          type="button"
          onClick={() => setExpandido(true)}
          className="text-xs font-medium text-primary hover:underline"
        >
          Ver historial completo ({restantes} más)
        </button>
      )}
    </div>
  );
}
