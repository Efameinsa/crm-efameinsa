import Link from "next/link";
import { Clock, FileText, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/reportes";
import { horaCorta, type ComercialSupervision } from "@/lib/supervision";

const ETIQUETA_TIPO: Record<string, string> = {
  llamada: "Llamadas",
  whatsapp: "WhatsApp",
  email: "Correo",
  visita: "Visitas",
};

// Tarjeta de supervisión de un comercial en un día. Mismo lenguaje visual que
// tabla-por-comercial.tsx (barra de progreso hacia la meta) y linea-tiempo-
// cuenta.tsx (colores ámbar/verde). Fila entera clickeable hacia su detalle,
// conservando la fecha que se esté viendo.
export function TarjetaSupervision({ c, meta, fecha }: { c: ComercialSupervision; meta: number; fecha: string }) {
  const pct = meta > 0 ? Math.round((c.seguimientos_efectivos / meta) * 100) : 0;
  const sinActividad = c.seguimientos_efectivos === 0 && c.intentos_sin_contacto === 0;

  return (
    <Link
      href={`/gerencia/comerciales/${c.id}?desde=${fecha}&hasta=${fecha}`}
      className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">
            {c.nombre}
            {c.codigo && <span className="ml-1 font-normal text-muted-foreground">({c.codigo}{c.codigo_anterior ? ` · antes ${c.codigo_anterior}` : ""})</span>}
          </p>
          {(c.primera_gestion || c.ultima_gestion) && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="size-3" />
              {horaCorta(c.primera_gestion)} → {horaCorta(c.ultima_gestion)}
            </p>
          )}
        </div>
        {c.agenda_vencida > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            <AlertTriangle className="size-3" /> {c.agenda_vencida} vencida{c.agenda_vencida === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn("h-full rounded-full transition-all", sinActividad ? "bg-transparent" : pct >= 100 ? "bg-[#1E7F4F]" : "bg-primary")}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
          {c.seguimientos_efectivos} / {meta}
        </span>
      </div>

      {sinActividad ? (
        <p className="mt-2 rounded-md bg-secondary px-2 py-1.5 text-[11px] text-muted-foreground">Sin actividad registrada este día.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(c.por_tipo).map(([tipo, n]) => (
            <span key={tipo} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground">
              {ETIQUETA_TIPO[tipo] ?? tipo}: {n}
            </span>
          ))}
        </div>
      )}

      <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {c.intentos_sin_contacto > 0 && <span>{c.intentos_sin_contacto} intento{c.intentos_sin_contacto === 1 ? "" : "s"} sin contacto</span>}
        <span className="flex items-center gap-1">
          <FileText className="size-3" /> {c.cotizaciones} cotización{c.cotizaciones === 1 ? "" : "es"}
        </span>
        {c.ventas > 0 && (
          <span className="flex items-center gap-1 font-semibold text-[#1E7F4F]">
            <TrendingUp className="size-3" /> {c.ventas} venta{c.ventas === 1 ? "" : "s"} · {usd(c.monto_vendido_usd)}
          </span>
        )}
        {c.agenda_pendiente > 0 && <span>{c.agenda_pendiente} pendiente{c.agenda_pendiente === 1 ? "" : "s"} hoy</span>}
      </p>
    </Link>
  );
}
