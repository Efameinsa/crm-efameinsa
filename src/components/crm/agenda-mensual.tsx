"use client";

import { useMemo, useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, X, CalendarDays, Clock } from "lucide-react";
import { toast } from "sonner";
import { reprogramarAccion } from "@/lib/acciones/oportunidades";
import { RegistroRapido, type ResultadoGestion } from "@/components/crm/registro-rapido";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { PuntoInteres } from "@/components/crm/punto-interes";
import { fechaCalendarioLarga } from "@/lib/fechas";
import { cn } from "@/lib/utils";

// Agenda mensual con panel lateral (patrón validado con gerencia sobre el
// mockup de Asana): la grilla es la vista, el dato sigue siendo la próxima
// acción única de cada oportunidad. Arrastrar una tarjeta a otro día la
// reprograma; el panel embebe el RegistroRapido (completar una gestión no es
// "marcar como hecha": es registrar qué pasó y programar la siguiente).

export interface AccionAgenda {
  id: string;
  etapa: string;
  intencion: string;
  monto: number | null;
  moneda: string;
  accion: string | null;
  fecha: string | null;
  hora: string | null;
  cuentaId: string;
  razonSocial: string;
}
export interface HechaAgenda { id: string; tipo: string; nota: string | null; fecha: string; razonSocial: string }
export interface VentaAgenda { id: string; fecha: string; monto: number; moneda: string; razonSocial: string }
export interface HistItem { tipo: string; nota: string | null; fecha: string }

const TIPO_LABEL: Record<string, string> = {
  llamada: "Llamada", whatsapp: "WhatsApp", email: "Correo", visita: "Visita",
  showroom: "Showroom", filtro: "Filtro", nota: "Nota", otro: "Gestión",
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function sumarMes(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10).slice(0, 7);
}
// Grilla lunes-a-domingo que cubre el mes completo.
function diasDelMes(mes: string): { iso: string; dia: number; otroMes: boolean }[] {
  const [y, m] = mes.split("-").map(Number);
  const primero = new Date(Date.UTC(y, m - 1, 1));
  const offset = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const inicio = new Date(primero);
  inicio.setUTCDate(1 - offset);
  const dias = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio);
    d.setUTCDate(inicio.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    dias.push({ iso, dia: d.getUTCDate(), otroMes: !iso.startsWith(mes) });
  }
  // recortar la última semana si es toda de otro mes
  return dias.length && dias[35].otroMes && dias.slice(35).every((x) => x.otroMes) ? dias.slice(0, 35) : dias;
}

export function AgendaMensual({
  mes, hoy, acciones: inicialAcciones, hechas, ventas, historial, resultados,
}: {
  mes: string;
  hoy: string;
  acciones: AccionAgenda[];
  hechas: HechaAgenda[];
  ventas: VentaAgenda[];
  historial: Record<string, HistItem[]>;
  resultados: ResultadoGestion[];
}) {
  const router = useRouter();
  const [acciones, setAcciones] = useState(inicialAcciones);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAcciones(inicialAcciones);
  }, [inicialAcciones]);
  const [seleccion, setSeleccion] = useState<string | null>(null); // id de oportunidad
  const [listaPanel, setListaPanel] = useState<"sin_fecha" | "vencidas" | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const dias = useMemo(() => diasDelMes(mes), [mes]);
  const sinFecha = acciones.filter((a) => !a.fecha);
  const vencidas = acciones.filter((a) => a.fecha && a.fecha < hoy);
  const porDia = useMemo(() => {
    const m = new Map<string, { acciones: AccionAgenda[]; hechas: HechaAgenda[]; ventas: VentaAgenda[] }>();
    const de = (iso: string) => { if (!m.has(iso)) m.set(iso, { acciones: [], hechas: [], ventas: [] }); return m.get(iso)!; };
    for (const a of acciones) if (a.fecha) de(a.fecha).acciones.push(a);
    for (const h of hechas) de(h.fecha).hechas.push(h);
    for (const v of ventas) de(v.fecha).ventas.push(v);
    for (const d of m.values()) d.acciones.sort((x, y) => (x.hora ?? "99").localeCompare(y.hora ?? "99"));
    return m;
  }, [acciones, hechas, ventas]);

  const cerrar = useCallback(() => { setSeleccion(null); setListaPanel(null); }, []);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [cerrar]);

  function reprogramar(id: string, fecha: string | null, hora: string | null) {
    const antes = acciones;
    setAcciones((prev) => prev.map((a) => (a.id === id ? { ...a, fecha, hora: fecha ? hora : null } : a)));
    startTransition(async () => {
      const r = await reprogramarAccion({ oportunidadId: id, fecha, hora });
      if (r.error) { toast.error(r.error); setAcciones(antes); }
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setArrastrando(null);
    const { active, over } = e;
    if (!over) return;
    const destino = String(over.id);
    const a = acciones.find((x) => x.id === active.id);
    if (!a || a.fecha === destino) return;
    reprogramar(a.id, destino, a.hora);
    toast.success(`Reprogramada al ${fechaCalendarioLarga(destino)}`);
  }

  const activa = arrastrando ? acciones.find((a) => a.id === arrastrando) : null;
  const seleccionada = seleccion ? acciones.find((a) => a.id === seleccion) : null;
  const abierto = !!seleccionada || !!listaPanel;
  const [anio, mesN] = mes.split("-").map(Number);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-lg font-bold text-foreground">Agenda</h1>
        {sinFecha.length > 0 && (
          <button
            type="button"
            onClick={() => { setSeleccion(null); setListaPanel("sin_fecha"); }}
            className="cursor-pointer rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-500/20"
          >
            Sin fecha ({sinFecha.length})
          </button>
        )}
        {vencidas.length > 0 && (
          <button
            type="button"
            onClick={() => { setSeleccion(null); setListaPanel("vencidas"); }}
            className="cursor-pointer rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive hover:bg-destructive/20"
          >
            Vencidas ({vencidas.length})
          </button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Link href={`/comercial/agenda?mes=${sumarMes(mes, -1)}`} className="rounded-md border border-border p-1.5 hover:bg-accent" aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href="/comercial/agenda" className="rounded-md border border-border px-3 py-1.5 text-xs font-bold hover:bg-accent">
            Hoy
          </Link>
          <Link href={`/comercial/agenda?mes=${sumarMes(mes, 1)}`} className="rounded-md border border-border p-1.5 hover:bg-accent" aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </Link>
          <span className="ml-2 min-w-[130px] text-center text-sm font-bold capitalize text-foreground">
            {MESES[mesN - 1]} {anio}
          </span>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={(e) => setArrastrando(String(e.active.id))} onDragEnd={onDragEnd}>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[repeat(6,1fr)_0.45fr] border-b border-border">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-[repeat(6,1fr)_0.45fr]">
            {dias.map((d, i) => (
              <Dia
                key={d.iso}
                iso={d.iso}
                dia={d.dia}
                otroMes={d.otroMes}
                esHoy={d.iso === hoy}
                domingo={i % 7 === 6}
                ultimaFila={i >= dias.length - 7}
                datos={porDia.get(d.iso)}
                hoyISO={hoy}
                onSel={(id) => { setListaPanel(null); setSeleccion(id); }}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activa && (
            <div className="w-44 rounded-md border-l-[3px] border-primary bg-[#f7eded] px-2 py-1 text-xs shadow-lg">
              <b>{activa.hora ? `${activa.hora} ` : ""}{activa.accion ?? "Gestionar"}</b>
              <span className="block truncate text-[11px] text-muted-foreground">{activa.razonSocial}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-muted-foreground">
        <Leyenda color="bg-[#f7eded] border-l-primary">Próxima acción</Leyenda>
        <Leyenda color="bg-destructive/10 border-l-destructive">Vencida</Leyenda>
        <Leyenda color="bg-secondary border-l-muted-foreground/40">Gestión realizada</Leyenda>
        <Leyenda color="bg-[#1E7F4F]/10 border-l-[#1E7F4F]">Venta</Leyenda>
        <span className="ml-auto">Arrastre una tarjeta a otro día para reprogramarla</span>
      </div>

      {/* Panel lateral */}
      <div
        className={cn("fixed inset-0 z-40 bg-[#2c2e35]/30 transition-opacity", abierto ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={cerrar}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="Detalle de la gestión"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[min(560px,94vw)] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-200 ease-out",
          abierto ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <CalendarDays className="size-4 text-primary" />
          <span className="text-sm font-bold text-foreground">
            {listaPanel === "sin_fecha" ? "Gestiones sin fecha" : listaPanel === "vencidas" ? "Gestiones vencidas" : "Detalle de la gestión"}
          </span>
          <button type="button" onClick={cerrar} className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {listaPanel && (
            <ul className="space-y-2">
              {(listaPanel === "sin_fecha" ? sinFecha : vencidas).map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => { setListaPanel(null); setSeleccion(a.id); }}
                    className="w-full cursor-pointer rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <p className="text-sm font-semibold text-foreground">{a.razonSocial}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.accion ?? "Sin acción definida"}
                      {listaPanel === "vencidas" && a.fecha && <> · venció el {fechaCalendarioLarga(a.fecha)}</>}
                    </p>
                  </button>
                </li>
              ))}
              {(listaPanel === "sin_fecha" ? sinFecha : vencidas).length === 0 && (
                <p className="text-sm text-muted-foreground">Nada pendiente aquí. 🎉</p>
              )}
            </ul>
          )}

          {seleccionada && (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-bold leading-snug text-foreground">{seleccionada.accion ?? "Definir próxima acción"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{seleccionada.razonSocial}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <EtapaBadge etapa={seleccionada.etapa as never} />
                  <PuntoInteres intencion={seleccionada.intencion} />
                  {seleccionada.monto != null && (
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {seleccionada.moneda} {Number(seleccionada.monto).toLocaleString("es-PE")} estimado
                    </span>
                  )}
                  {seleccionada.fecha && seleccionada.fecha < hoy && (
                    <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11px] font-semibold text-destructive">Vencida</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                <Clock className="size-4 text-muted-foreground" />
                <input
                  type="date"
                  value={seleccionada.fecha ?? ""}
                  onChange={(e) => reprogramar(seleccionada.id, e.target.value || null, seleccionada.hora)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  aria-label="Fecha de la próxima acción"
                />
                <input
                  type="time"
                  value={seleccionada.hora ?? ""}
                  onChange={(e) => reprogramar(seleccionada.id, seleccionada.fecha, e.target.value || null)}
                  disabled={!seleccionada.fecha}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:opacity-50"
                  aria-label="Hora"
                />
                <span className="text-[11px] text-muted-foreground">sin hora = todo el día</span>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Registrar gestión</p>
                <RegistroRapido oportunidadId={seleccionada.id} resultados={resultados} />
              </div>

              {(historial[seleccionada.id] ?? []).length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Últimas gestiones</p>
                  <ul className="divide-y divide-border">
                    {historial[seleccionada.id].map((h, i) => (
                      <li key={i} className="grid grid-cols-[78px_1fr] gap-2 py-2 text-xs">
                        <span className="tabular-nums text-muted-foreground">{h.fecha.slice(8, 10)}/{h.fecha.slice(5, 7)}</span>
                        <span className="text-foreground">
                          <b>{TIPO_LABEL[h.tipo] ?? h.tipo}</b>
                          {h.nota ? ` — ${h.nota}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={() => router.push(`/comercial/oportunidades/${seleccionada.id}`)}
                className="cursor-pointer text-sm font-bold text-primary hover:underline"
              >
                Abrir ficha completa →
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Leyenda({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={cn("inline-block size-2.5 rounded-sm border-l-[3px]", color)} />
      {children}
    </span>
  );
}

function Dia({
  iso, dia, otroMes, esHoy, domingo, ultimaFila, datos, hoyISO, onSel,
}: {
  iso: string; dia: number; otroMes: boolean; esHoy: boolean; domingo: boolean; ultimaFila: boolean;
  datos?: { acciones: AccionAgenda[]; hechas: HechaAgenda[]; ventas: VentaAgenda[] };
  hoyISO: string;
  onSel: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  const MAX = 3;
  const items: React.ReactNode[] = [];
  let n = 0;
  for (const v of datos?.ventas ?? []) {
    if (n++ < MAX) items.push(
      <div key={`v${v.id}`} className="my-0.5 rounded-md border-l-[3px] border-[#1E7F4F] bg-[#1E7F4F]/10 px-1.5 py-0.5 text-[11.5px] leading-tight">
        <b className="text-[#1E7F4F]">✓ Venta {v.moneda === "PEN" ? "S/" : "US$"} {Number(v.monto).toLocaleString("es-PE")}</b>
        <span className="block truncate text-[10.5px] text-muted-foreground">{v.razonSocial}</span>
      </div>,
    );
  }
  for (const a of datos?.acciones ?? []) {
    if (n++ < MAX) items.push(<Tarjeta key={a.id} a={a} vencida={!!a.fecha && a.fecha < hoyISO} onSel={onSel} />);
  }
  for (const h of datos?.hechas ?? []) {
    if (n++ < MAX) items.push(
      <div key={`h${h.id}`} className="my-0.5 rounded-md border-l-[3px] border-muted-foreground/40 bg-secondary px-1.5 py-0.5 text-[11.5px] leading-tight text-muted-foreground" title={h.nota ?? undefined}>
        <span className="line-through">✓ {TIPO_LABEL[h.tipo] ?? h.tipo}</span>
        <span className="block truncate text-[10.5px]">{h.razonSocial}</span>
      </div>,
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[112px] border-b border-r border-border p-1.5 transition-colors last:border-r-0",
        domingo && "border-r-0 bg-[#faf9f8]",
        ultimaFila && "border-b-0",
        isOver && "bg-primary/5 ring-2 ring-inset ring-primary/40",
      )}
    >
      <span
        className={cn(
          "inline-block rounded-md px-1.5 py-0.5 text-xs tabular-nums",
          otroMes ? "text-muted-foreground/40" : "text-muted-foreground",
          esHoy && "bg-primary font-bold text-primary-foreground",
        )}
      >
        {dia}
      </span>
      {items}
      {n > MAX && <span className="px-1 text-[11px] text-muted-foreground">{n - MAX} más</span>}
    </div>
  );
}

function Tarjeta({ a, vencida, onSel }: { a: AccionAgenda; vencida: boolean; onSel: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: a.id });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      onClick={() => onSel(a.id)}
      className={cn(
        "my-0.5 block w-full cursor-pointer rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11.5px] leading-tight transition-[filter] hover:brightness-95",
        vencida ? "border-destructive bg-destructive/10" : "border-primary bg-[#f7eded]",
        isDragging && "opacity-40",
      )}
    >
      <b className={cn(vencida && "text-destructive")}>
        {vencida ? "Vencida · " : a.hora ? `${a.hora} ` : ""}
        {a.accion ?? "Gestionar"}
      </b>
      <span className="block truncate text-[10.5px] text-muted-foreground">{a.razonSocial}</span>
    </button>
  );
}
