"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { cambiarEtapa } from "@/lib/acciones/oportunidades";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PuntoInteres } from "@/components/crm/punto-interes";
import { cn } from "@/lib/utils";
import type { EtapaOportunidad } from "@/types/database";

export interface OportunidadKanban {
  id: string;
  etapa: EtapaOportunidad;
  razon_social: string;
  intencion: string;
  monto_estimado: number | null;
  moneda: string;
  updated_at: string;
  cotizacion_pendiente: boolean;
  cotizacion_rechazada: boolean;
}

const COLUMNAS: { etapa: EtapaOportunidad; etiqueta: string; droppable: boolean }[] = [
  { etapa: "asignada", etiqueta: "Asignada", droppable: true },
  { etapa: "filtrada", etiqueta: "Filtrada", droppable: true },
  { etapa: "cotizada", etiqueta: "Cotizada", droppable: false },
  { etapa: "seguimiento", etiqueta: "Seguimiento", droppable: true },
  { etapa: "potencial", etiqueta: "Potencial", droppable: true },
];

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function formatoMonto(op: OportunidadKanban): string {
  return op.monto_estimado ? `${op.moneda} ${op.monto_estimado.toLocaleString("es-PE")}` : "—";
}

function Tarjeta({ op, arrastrando }: { op: OportunidadKanban; arrastrando?: boolean }) {
  const dias = diasDesde(op.updated_at);
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow",
        arrastrando ? "rotate-2 scale-105 shadow-lg ring-1 ring-primary" : "hover:shadow-md",
      )}
    >
      <Link
        href={`/comercial/oportunidades/${op.id}`}
        className="mb-1.5 block text-xs font-semibold text-foreground hover:underline"
        onClick={(e) => arrastrando && e.preventDefault()}
      >
        {op.razon_social}
      </Link>
      <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
        <PuntoInteres intencion={op.intencion} />
        <span>{formatoMonto(op)}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px]",
            dias >= 14 ? "bg-destructive/10 text-destructive" : dias >= 7 ? "bg-amber-500/10 text-amber-700" : "text-muted-foreground",
          )}
        >
          {dias === 0 ? "Hoy" : `${dias} día${dias === 1 ? "" : "s"}`}
        </span>
      </div>
      {op.cotizacion_pendiente && (
        <span className="mt-2 inline-block rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-700">
          Cotización pendiente de gerencia
        </span>
      )}
      {op.cotizacion_rechazada && (
        <span className="mt-2 inline-block rounded-md bg-destructive/10 px-2 py-1 text-[10px] font-medium text-destructive">
          Rechazada por gerencia — recotizar
        </span>
      )}
    </div>
  );
}

function TarjetaArrastrable({ op }: { op: OportunidadKanban }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: op.id,
    data: { etapaActual: op.etapa },
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn("mb-2 cursor-grab active:cursor-grabbing", isDragging && "opacity-30")}>
      <Tarjeta op={op} />
    </div>
  );
}

function Columna({
  etapa,
  etiqueta,
  droppable,
  oportunidades,
}: {
  etapa: EtapaOportunidad;
  etiqueta: string;
  droppable: boolean;
  oportunidades: OportunidadKanban[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa, disabled: !droppable });
  const total = oportunidades.reduce((acc, o) => acc + (o.monto_estimado ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-w-[220px] flex-1 rounded-xl bg-secondary/60 p-2.5 transition-colors",
        isOver && droppable && "bg-primary/10 ring-2 ring-primary/40",
        isOver && !droppable && "bg-destructive/5",
      )}
    >
      <div className="mb-2.5 flex items-baseline justify-between px-1">
        <b className="text-[11px] font-bold uppercase tracking-wide text-foreground">{etiqueta}</b>
        <small className="tabular-nums text-[11px] text-muted-foreground">
          {oportunidades.length} · {total > 0 ? total.toLocaleString("es-PE") : 0}
        </small>
      </div>
      {oportunidades.map((op) => (
        <TarjetaArrastrable key={op.id} op={op} />
      ))}
      {oportunidades.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-border/70 p-4 text-center text-[11px] text-muted-foreground">
          Sin oportunidades
        </div>
      )}
    </div>
  );
}

export function PipelineKanban({
  oportunidades: iniciales,
  motivos,
}: {
  oportunidades: OportunidadKanban[];
  motivos: { id: number; nombre: string }[];
}) {
  const [oportunidades, setOportunidades] = useState(iniciales);
  const [activoId, setActivoId] = useState<string | null>(null);
  const [pendienteRechazo, setPendienteRechazo] = useState<string | null>(null);
  const [motivoId, setMotivoId] = useState<string>("");
  const [, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const abiertas = useMemo(() => oportunidades.filter((o) => COLUMNAS.some((c) => c.etapa === o.etapa)), [oportunidades]);
  const cerradas = useMemo(
    () => oportunidades.filter((o) => !COLUMNAS.some((c) => c.etapa === o.etapa)),
    [oportunidades],
  );
  const activo = oportunidades.find((o) => o.id === activoId) ?? null;

  function aplicarEtapa(id: string, etapa: EtapaOportunidad, motivoRechazoId: number | null) {
    const anterior = oportunidades;
    setOportunidades((prev) => prev.map((o) => (o.id === id ? { ...o, etapa } : o)));
    startTransition(async () => {
      const r = await cambiarEtapa({ oportunidadId: id, etapa, motivoRechazoId });
      if (r.error) {
        toast.error(r.error);
        setOportunidades(anterior);
      }
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActivoId(e.active.id as string);
  }

  function onDragEnd(e: DragEndEvent) {
    setActivoId(null);
    const { active, over } = e;
    if (!over) return;
    const etapaDestino = over.id as EtapaOportunidad | "rechazada-zona";
    const etapaActual = active.data.current?.etapaActual as EtapaOportunidad;
    if (etapaDestino === etapaActual) return;

    if (etapaDestino === "rechazada-zona") {
      setPendienteRechazo(active.id as string);
      return;
    }

    const columnaDestino = COLUMNAS.find((c) => c.etapa === etapaDestino);
    if (columnaDestino && !columnaDestino.droppable) {
      toast.error("La etapa Cotizada se alcanza cotizando desde el detalle, no arrastrando.");
      return;
    }

    aplicarEtapa(active.id as string, etapaDestino as EtapaOportunidad, null);
  }

  function confirmarRechazo() {
    if (!motivoId || !pendienteRechazo) return;
    aplicarEtapa(pendienteRechazo, "rechazada", Number(motivoId));
    setPendienteRechazo(null);
    setMotivoId("");
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLUMNAS.map((c) => (
            <Columna
              key={c.etapa}
              etapa={c.etapa}
              etiqueta={c.etiqueta}
              droppable={c.droppable}
              oportunidades={abiertas.filter((o) => o.etapa === c.etapa)}
            />
          ))}
          <RechazadaDropzone cantidad={cerradas.filter((o) => o.etapa === "rechazada").length} />
        </div>
        <DragOverlay>{activo && <Tarjeta op={activo} arrastrando />}</DragOverlay>
      </DndContext>

      <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
        <span className="text-muted-foreground">Cerradas recientes:</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1E7F4F]/10 px-2.5 py-1 font-semibold text-[#1E7F4F]">
          {cerradas.filter((o) => o.etapa === "venta").length} venta(s)
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 font-semibold text-destructive">
          {cerradas.filter((o) => o.etapa === "rechazada").length} rechazada(s)
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 font-semibold text-muted-foreground">
          {cerradas.filter((o) => o.etapa === "derivada").length} derivada(s)
        </span>
      </div>

      <Dialog open={pendienteRechazo !== null} onOpenChange={(v) => !v && setPendienteRechazo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar oportunidad</DialogTitle>
            <DialogDescription>Seleccione el motivo — es obligatorio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-kanban">Motivo</Label>
            <Select value={motivoId} onValueChange={(v) => setMotivoId(v ?? "")}>
              <SelectTrigger id="motivo-kanban" className="w-full">
                <SelectValue placeholder="Seleccione…" />
              </SelectTrigger>
              <SelectContent>
                {motivos.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={confirmarRechazo} disabled={!motivoId}>
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Zona de "Rechazada": soltar aquí NO aplica el cambio directo, solo marca el
// destino — onDragEnd (arriba) es quien abre el diálogo de motivo obligatorio.
function RechazadaDropzone({ cantidad }: { cantidad: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: "rechazada-zona" });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-[160px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-destructive/30 bg-destructive/5 p-2.5 text-center transition-colors",
        isOver && "border-destructive bg-destructive/10",
      )}
    >
      <b className="text-[11px] font-bold uppercase tracking-wide text-destructive">Rechazar</b>
      <span className="text-[10px] text-muted-foreground">Soltar aquí · {cantidad} este período</span>
    </div>
  );
}
