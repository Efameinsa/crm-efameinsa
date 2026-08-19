"use client";

import { useMemo, useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, X, CalendarDays, Clock, Check, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { reprogramarAccion } from "@/lib/acciones/oportunidades";
import { crearTarea, actualizarTarea, eliminarTarea } from "@/lib/acciones/tareas";
import { RegistroRapido, type ResultadoGestion, type MotivoRechazo } from "@/components/crm/registro-rapido";
import { SelectorFecha } from "@/components/crm/selector-fecha";
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
export interface HechaAgenda { id: string; tipo: string; nota: string | null; fecha: string; razonSocial: string; oportunidadId: string }
// Tarea personal (migración 0028): sin cliente; lo de clientes va por oportunidad.
export interface TareaAgenda { id: string; titulo: string; fecha: string; hora: string | null; completada: boolean }
export interface VentaAgenda { id: string; fecha: string; monto: number; moneda: string; razonSocial: string; oportunidadId: string }
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
  mes, hoy, acciones: inicialAcciones, hechas, ventas, historial, resultados, motivos = [], tareas: inicialTareas = [],
}: {
  mes: string;
  hoy: string;
  acciones: AccionAgenda[];
  hechas: HechaAgenda[];
  ventas: VentaAgenda[];
  historial: Record<string, HistItem[]>;
  resultados: ResultadoGestion[];
  motivos?: MotivoRechazo[];
  tareas?: TareaAgenda[];
}) {
  const router = useRouter();
  const [acciones, setAcciones] = useState(inicialAcciones);
  const [tareas, setTareas] = useState(inicialTareas);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAcciones(inicialAcciones);
    setTareas(inicialTareas);
  }, [inicialAcciones, inicialTareas]);
  const [seleccion, setSeleccion] = useState<string | null>(null); // id de oportunidad
  const [tareaSel, setTareaSel] = useState<string | null>(null); // id de tarea personal
  const [hechaSel, setHechaSel] = useState<string | null>(null); // gestión realizada (solo lectura)
  const [ventaSel, setVentaSel] = useState<string | null>(null); // venta (solo lectura)
  const [agregarFecha, setAgregarFecha] = useState<string | null>(null); // día del "+ Agregar"
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [nuevaHora, setNuevaHora] = useState("");
  const [listaPanel, setListaPanel] = useState<"sin_fecha" | "vencidas" | null>(null);
  const [reprogramando, setReprogramando] = useState(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const dias = useMemo(() => diasDelMes(mes), [mes]);
  const sinFecha = acciones.filter((a) => !a.fecha);
  const vencidas = acciones.filter((a) => a.fecha && a.fecha < hoy);
  const porDia = useMemo(() => {
    const m = new Map<string, { acciones: AccionAgenda[]; hechas: HechaAgenda[]; ventas: VentaAgenda[]; tareas: TareaAgenda[] }>();
    const de = (iso: string) => { if (!m.has(iso)) m.set(iso, { acciones: [], hechas: [], ventas: [], tareas: [] }); return m.get(iso)!; };
    for (const a of acciones) if (a.fecha) de(a.fecha).acciones.push(a);
    for (const h of hechas) de(h.fecha).hechas.push(h);
    for (const v of ventas) de(v.fecha).ventas.push(v);
    for (const t of tareas) de(t.fecha).tareas.push(t);
    for (const d of m.values()) {
      d.acciones.sort((x, y) => (x.hora ?? "99").localeCompare(y.hora ?? "99"));
      d.tareas.sort((x, y) => (x.hora ?? "99").localeCompare(y.hora ?? "99"));
    }
    return m;
  }, [acciones, hechas, ventas, tareas]);

  const cerrar = useCallback(() => {
    setSeleccion(null); setTareaSel(null); setHechaSel(null); setVentaSel(null); setAgregarFecha(null); setListaPanel(null); setReprogramando(false);
    setNuevoTitulo(""); setNuevaHora("");
  }, []);
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

  function moverTarea(id: string, fecha: string) {
    const antes = tareas;
    setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, fecha } : t)));
    startTransition(async () => {
      const r = await actualizarTarea({ id, fecha });
      if (r.error) { toast.error(r.error); setTareas(antes); }
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setArrastrando(null);
    const { active, over } = e;
    if (!over) return;
    const destino = String(over.id);
    const activeId = String(active.id);
    if (activeId.startsWith("t:")) {
      const t = tareas.find((x) => "t:" + x.id === activeId);
      if (!t || t.fecha === destino) return;
      moverTarea(t.id, destino);
      toast.success(`Tarea movida al ${fechaCalendarioLarga(destino)}`);
      return;
    }
    const a = acciones.find((x) => x.id === activeId);
    if (!a || a.fecha === destino) return;
    reprogramar(a.id, destino, a.hora);
    toast.success(`Reprogramada al ${fechaCalendarioLarga(destino)}`);
  }

  const activa = arrastrando && !arrastrando.startsWith("t:") ? acciones.find((a) => a.id === arrastrando) : null;
  const tareaArrastrada = arrastrando?.startsWith("t:") ? tareas.find((t) => "t:" + t.id === arrastrando) : null;
  const seleccionada = seleccion ? acciones.find((a) => a.id === seleccion) : null;
  const tareaAbierta = tareaSel ? tareas.find((t) => t.id === tareaSel) : null;
  const hechaAbierta = hechaSel ? hechas.find((h) => h.id === hechaSel) : null;
  const ventaAbierta = ventaSel ? ventas.find((v) => v.id === ventaSel) : null;
  const abierto = !!seleccionada || !!listaPanel || !!tareaAbierta || !!agregarFecha || !!hechaAbierta || !!ventaAbierta;
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
                onSel={(id) => { cerrar(); setSeleccion(id); }}
                onSelTarea={(id) => { cerrar(); setTareaSel(id); }}
                onSelHecha={(id) => { cerrar(); setHechaSel(id); }}
                onSelVenta={(id) => { cerrar(); setVentaSel(id); }}
                onAgregar={(iso) => { cerrar(); setAgregarFecha(iso); }}
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
          {tareaArrastrada && (
            <div className="w-44 rounded-md border-l-[3px] border-[#2C5F8A] bg-[#eef3f8] px-2 py-1 text-xs shadow-lg">
              <b>{tareaArrastrada.hora ? `${tareaArrastrada.hora} ` : ""}{tareaArrastrada.titulo}</b>
              <span className="block text-[11px] text-muted-foreground">Personal</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-muted-foreground">
        <Leyenda color="bg-[#f7eded] border-l-primary">Próxima acción</Leyenda>
        <Leyenda color="bg-destructive/10 border-l-destructive">Vencida</Leyenda>
        <Leyenda color="bg-secondary border-l-muted-foreground/40">Gestión realizada</Leyenda>
        <Leyenda color="bg-[#1E7F4F]/10 border-l-[#1E7F4F]">Venta</Leyenda>
        <Leyenda color="bg-[#eef3f8] border-l-[#2C5F8A]">Tarea personal</Leyenda>
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
            {listaPanel === "sin_fecha"
              ? "Gestiones sin fecha"
              : listaPanel === "vencidas"
                ? "Gestiones vencidas"
                : agregarFecha
                  ? `Agregar al ${fechaCalendarioLarga(agregarFecha)}`
                  : tareaAbierta
                    ? "Tarea personal"
                    : ventaAbierta
                      ? "Venta cerrada"
                      : hechaAbierta
                        ? "Gestión realizada"
                        : "Detalle de la gestión"}
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

          {agregarFecha && (
            <div className="space-y-5">
              <div className="space-y-2 rounded-lg border border-border p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tarea personal (sin cliente)</p>
                <input
                  value={nuevoTitulo}
                  onChange={(e) => setNuevoTitulo(e.target.value)}
                  placeholder="ej. Preparar reporte de cierre semanal"
                  autoFocus
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  aria-label="Título de la tarea"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={nuevaHora}
                    onChange={(e) => setNuevaHora(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    aria-label="Hora (opcional)"
                  />
                  <span className="text-[11px] text-muted-foreground">sin hora = todo el día</span>
                  <button
                    type="button"
                    disabled={!nuevoTitulo.trim()}
                    onClick={() => {
                      const fecha = agregarFecha;
                      const titulo = nuevoTitulo.trim();
                      const hora = nuevaHora || null;
                      startTransition(async () => {
                        const r = await crearTarea({ titulo, fecha, hora });
                        if (r.error) { toast.error(r.error); return; }
                        setTareas((prev) => [...prev, { id: r.id!, titulo, fecha, hora, completada: false }]);
                        toast.success("Tarea agregada");
                        cerrar();
                      });
                    }}
                    className="ml-auto cursor-pointer rounded-md bg-[#2C5F8A] px-3 py-2 text-xs font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Crear tarea
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  …o programe una gestión de cliente para ese día
                </p>
                {sinFecha.length > 0 ? (
                  <ul className="space-y-1.5">
                    {sinFecha.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            const fecha = agregarFecha;
                            reprogramar(a.id, fecha, null);
                            toast.success(`${a.razonSocial} programada al ${fechaCalendarioLarga(fecha)}`);
                            cerrar();
                          }}
                          className="w-full cursor-pointer rounded-lg border border-border p-2.5 text-left text-xs transition-colors hover:bg-accent"
                        >
                          <b className="text-foreground">{a.razonSocial}</b>
                          <span className="block text-muted-foreground">{a.accion ?? "Sin acción definida"} · hoy sin fecha</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No hay gestiones sin fecha. Para programar la gestión de un cliente, ábrala desde su tarjeta en el calendario o desde la
                    oportunidad — así queda ligada al cliente, no como tarea suelta.
                  </p>
                )}
              </div>
            </div>
          )}

          {hechaAbierta && (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-bold leading-snug text-foreground">
                  ✓ {TIPO_LABEL[hechaAbierta.tipo] ?? hechaAbierta.tipo}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{hechaAbierta.razonSocial}</p>
                <p className="mt-1 text-xs text-muted-foreground">Realizada el {fechaCalendarioLarga(hechaAbierta.fecha)}</p>
              </div>
              {hechaAbierta.nota && (
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/50 p-3 text-sm text-foreground">{hechaAbierta.nota}</p>
              )}
              <button
                type="button"
                onClick={() => router.push(`/comercial/oportunidades/${hechaAbierta.oportunidadId}`)}
                className="cursor-pointer text-sm font-bold text-primary hover:underline"
              >
                Abrir ficha completa →
              </button>
            </div>
          )}

          {ventaAbierta && (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-bold leading-snug text-[#1E7F4F]">
                  ✓ Venta {ventaAbierta.moneda === "PEN" ? "S/" : "US$"} {Number(ventaAbierta.monto).toLocaleString("es-PE")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{ventaAbierta.razonSocial}</p>
                <p className="mt-1 text-xs text-muted-foreground">Cerrada el {fechaCalendarioLarga(ventaAbierta.fecha)}</p>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/comercial/oportunidades/${ventaAbierta.oportunidadId}`)}
                className="cursor-pointer text-sm font-bold text-primary hover:underline"
              >
                Abrir ficha completa →
              </button>
            </div>
          )}

          {tareaAbierta && (
            <div className="space-y-4">
              <p className={cn("text-lg font-bold leading-snug", tareaAbierta.completada ? "text-muted-foreground line-through" : "text-foreground")}>
                {tareaAbierta.titulo}
              </p>
              <span className="inline-block rounded-full bg-[#eef3f8] px-2.5 py-0.5 text-[11px] font-semibold text-[#2C5F8A]">Tarea personal</span>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                <SelectorFecha
                  valor={tareaAbierta.fecha}
                  onCambiar={(f) => f && moverTarea(tareaAbierta.id, f)}
                  permitirQuitar={false}
                />
                <input
                  type="time"
                  value={tareaAbierta.hora ?? ""}
                  onChange={(e) => {
                    const hora = e.target.value || null;
                    setTareas((prev) => prev.map((t) => (t.id === tareaAbierta.id ? { ...t, hora } : t)));
                    startTransition(async () => {
                      const r = await actualizarTarea({ id: tareaAbierta.id, hora });
                      if (r.error) toast.error(r.error);
                    });
                  }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  aria-label="Hora"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nuevo = !tareaAbierta.completada;
                    setTareas((prev) => prev.map((t) => (t.id === tareaAbierta.id ? { ...t, completada: nuevo } : t)));
                    startTransition(async () => {
                      const r = await actualizarTarea({ id: tareaAbierta.id, completada: nuevo });
                      if (r.error) toast.error(r.error);
                    });
                  }}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold",
                    tareaAbierta.completada ? "border border-border text-muted-foreground hover:bg-accent" : "bg-[#1E7F4F] text-white hover:brightness-110",
                  )}
                >
                  <Check className="size-3.5" /> {tareaAbierta.completada ? "Marcar pendiente" : "Marcar hecha"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = tareaAbierta.id;
                    setTareas((prev) => prev.filter((t) => t.id !== id));
                    cerrar();
                    startTransition(async () => {
                      const r = await eliminarTarea(id);
                      if (r.error) toast.error(r.error);
                    });
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5" /> Eliminar
                </button>
              </div>
            </div>
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

              {/* Una sola fecha visible: la del "¿qué sigue?" del registro. Esta
                  línea solo INFORMA lo programado; "Reprogramar" (o arrastrar en
                  el calendario) es para mover sin registrar gestión. */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                {seleccionada.fecha ? (
                  <span>
                    Programada: <b className="text-foreground">{fechaCalendarioLarga(seleccionada.fecha)}</b>
                    {seleccionada.hora ? <b className="text-foreground">, {seleccionada.hora}</b> : " (todo el día)"}
                  </span>
                ) : (
                  <span>Sin fecha programada</span>
                )}
                <button
                  type="button"
                  onClick={() => setReprogramando((v) => !v)}
                  className="cursor-pointer font-semibold text-primary hover:underline"
                >
                  {reprogramando ? "Listo" : "Reprogramar"}
                </button>
                {reprogramando && (
                  <span className="flex flex-wrap items-center gap-2">
                    <SelectorFecha
                      valor={seleccionada.fecha}
                      onCambiar={(f) => reprogramar(seleccionada.id, f, seleccionada.hora)}
                      etiquetaVacia="Elegir fecha"
                    />
                    <input
                      type="time"
                      value={seleccionada.hora ?? ""}
                      onChange={(e) => reprogramar(seleccionada.id, seleccionada.fecha, e.target.value || null)}
                      disabled={!seleccionada.fecha}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:opacity-50"
                      aria-label="Hora"
                    />
                  </span>
                )}
              </div>

              <RegistroRapido oportunidadId={seleccionada.id} resultados={resultados} motivos={motivos} />

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
  iso, dia, otroMes, esHoy, domingo, ultimaFila, datos, hoyISO, onSel, onSelTarea, onSelHecha, onSelVenta, onAgregar,
}: {
  iso: string; dia: number; otroMes: boolean; esHoy: boolean; domingo: boolean; ultimaFila: boolean;
  datos?: { acciones: AccionAgenda[]; hechas: HechaAgenda[]; ventas: VentaAgenda[]; tareas: TareaAgenda[] };
  hoyISO: string;
  onSel: (id: string) => void;
  onSelTarea: (id: string) => void;
  onSelHecha: (id: string) => void;
  onSelVenta: (id: string) => void;
  onAgregar: (iso: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  const MAX = 3;
  const items: React.ReactNode[] = [];
  let n = 0;
  for (const v of datos?.ventas ?? []) {
    if (n++ < MAX) items.push(
      <button
        key={`v${v.id}`}
        type="button"
        onClick={() => onSelVenta(v.id)}
        className="my-0.5 block w-full cursor-pointer rounded-md border-l-[3px] border-[#1E7F4F] bg-[#1E7F4F]/10 px-1.5 py-0.5 text-left text-[11.5px] leading-tight transition-[filter] hover:brightness-95"
      >
        <b className="text-[#1E7F4F]">✓ Venta {v.moneda === "PEN" ? "S/" : "US$"} {Number(v.monto).toLocaleString("es-PE")}</b>
        <span className="block truncate text-[10.5px] text-muted-foreground">{v.razonSocial}</span>
      </button>,
    );
  }
  for (const a of datos?.acciones ?? []) {
    if (n++ < MAX) items.push(<Tarjeta key={a.id} a={a} vencida={!!a.fecha && a.fecha < hoyISO} onSel={onSel} />);
  }
  for (const t of datos?.tareas ?? []) {
    if (n++ < MAX) items.push(<TarjetaTarea key={t.id} t={t} onSel={onSelTarea} />);
  }
  for (const h of datos?.hechas ?? []) {
    if (n++ < MAX) items.push(
      <button
        key={`h${h.id}`}
        type="button"
        onClick={() => onSelHecha(h.id)}
        title={h.nota ?? undefined}
        className="my-0.5 block w-full cursor-pointer rounded-md border-l-[3px] border-muted-foreground/40 bg-secondary px-1.5 py-0.5 text-left text-[11.5px] leading-tight text-muted-foreground transition-[filter] hover:brightness-95"
      >
        <span className="line-through">✓ {TIPO_LABEL[h.tipo] ?? h.tipo}</span>
        <span className="block truncate text-[10.5px]">{h.razonSocial}</span>
      </button>,
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group min-h-[112px] border-b border-r border-border p-1.5 transition-colors last:border-r-0",
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
      {!otroMes && (
        <button
          type="button"
          onClick={() => onAgregar(iso)}
          className="mt-0.5 w-full cursor-pointer rounded-md border border-dashed border-border py-0.5 text-center text-[11px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`Agregar al ${iso}`}
        >
          <Plus className="inline size-3" /> Agregar
        </button>
      )}
    </div>
  );
}

function TarjetaTarea({ t, onSel }: { t: TareaAgenda; onSel: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: "t:" + t.id });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      onClick={() => onSel(t.id)}
      className={cn(
        "my-0.5 block w-full cursor-pointer rounded-md border-l-[3px] border-[#2C5F8A] bg-[#eef3f8] px-1.5 py-0.5 text-left text-[11.5px] leading-tight transition-[filter] hover:brightness-95",
        isDragging && "opacity-40",
      )}
    >
      <b className={cn(t.completada && "text-muted-foreground line-through")}>
        {t.completada ? "✓ " : t.hora ? `${t.hora} ` : ""}
        {t.titulo}
      </b>
      <span className="block text-[10.5px] text-muted-foreground">Personal</span>
    </button>
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
