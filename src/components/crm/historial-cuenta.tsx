"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowDownUp, ChevronRight, FileText } from "lucide-react";
import {
  LineaTiempoCuenta,
  ETIQUETA_ACTIVIDAD,
  COLOR_COTIZACION,
  CuerpoSolicitud,
  type EventoTimeline,
} from "@/components/crm/linea-tiempo-cuenta";
import { TipoExpedienteBadge } from "@/components/crm/tipo-expediente-badge";
import { bordeTipoExpediente, colorTipoExpediente, etiquetaTipoExpediente } from "@/lib/tipo-expediente";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { textoLegible } from "@/lib/texto";
import { fechaAgendada, fechaConHora } from "@/lib/fechas";

const MOSTRADOS_INICIAL = 25;

function textoBuscable(evento: EventoTimeline): string {
  if (evento.tipo === "actividad") {
    return [
      ETIQUETA_ACTIVIDAD[evento.tipoActividad] ?? evento.tipoActividad,
      evento.nota ?? "",
      evento.resultado?.nombre ?? "",
    ]
      .join(" ")
      .toLowerCase();
  }
  if (evento.tipo === "cotizacion") {
    return [evento.codigo ?? "", "cotización", evento.estadoLabel].join(" ").toLowerCase();
  }
  if (evento.tipo === "solicitud") return ["solicitud inicio", evento.mensaje ?? "", evento.codigo ?? "", evento.quien ?? ""].join(" ").toLowerCase();
  if (evento.tipo === "servicio") return [evento.titulo, evento.detalle ?? ""].join(" ").toLowerCase();
  return "venta cerrada";
}

// La vista por defecto de la ficha del cliente: el vendedor que recibe una
// cartera reasignada llega con la pregunta del Excel que usaban antes —
// "cuéntame la historia de este cliente" — y eso lo responde mejor una
// tabla densa con la nota completa que una timeline con aire entre eventos.
// oportunidadActualId: cuando el historial se muestra DENTRO del detalle de
// una oportunidad, las filas de esa misma oportunidad no navegan (ir a la
// página en la que ya estás parecía "un clic que no hace nada" — reporte de
// Darwin 19-08); las de otras oportunidades del cliente sí.
//
// CADA EXPEDIENTE CON SU PROPIA HISTORIA (gerencia, 28-09). Rubí: «cuando yo
// abro las dos me sale el mismo historial general… debería tener una
// correlación de expedientes para cada tema, para que no se mezcle la
// información». Carlos, al cierre: «de manera independiente sería mejor… todo
// el detalle de un solo caso». Dentro de un expediente se ve SOLO lo suyo (con
// un botón para abrir la del cliente entero); en la ficha del cliente se ve
// todo, cada fila con el color de su expediente y un filtro para quedarse con
// uno.
export function HistorialCuenta({ eventos, oportunidadActualId }: { eventos: EventoTimeline[]; oportunidadActualId?: string }) {
  const [vista, setVista] = useState<"tabla" | "timeline">("tabla");
  const [orden, setOrden] = useState<"reciente" | "antiguo">("reciente");
  const [busqueda, setBusqueda] = useState("");
  const [expandido, setExpandido] = useState(false);
  // En el expediente arranca en «este expediente»; en la ficha, en «todos».
  const [filtroExpediente, setFiltroExpediente] = useState<string | null>(oportunidadActualId ?? null);

  // Los expedientes que aparecen en esta historia, para el filtro: el de
  // movimiento más reciente primero, con su tipo y cuántas filas tiene.
  const expedientes = useMemo(() => {
    const m = new Map<string, { id: string; tipo: string | null; n: number; ultima: number; primera: string }>();
    for (const e of eventos) {
      if (!e.expediente) continue;
      const t = new Date(e.fecha).getTime();
      const x = m.get(e.expediente) ?? { id: e.expediente, tipo: e.expedienteTipo ?? null, n: 0, ultima: t, primera: e.fecha };
      x.n++;
      if (t > x.ultima) x.ultima = t;
      if (new Date(e.fecha).getTime() < new Date(x.primera).getTime()) x.primera = e.fecha;
      m.set(e.expediente, x);
    }
    return [...m.values()].sort((a, b) => b.ultima - a.ultima);
  }, [eventos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let base = filtroExpediente ? eventos.filter((e) => e.expediente === filtroExpediente) : eventos;
    base = q ? base.filter((e) => textoBuscable(e).includes(q)) : base;
    // `eventos` llega ordenado descendente (reciente primero) desde el servidor.
    return orden === "reciente" ? base : [...base].reverse();
  }, [eventos, busqueda, orden, filtroExpediente]);

  // LA HISTORIA DE ANTES, A LA VISTA (Katerine, 29-09: «este prospecto tiene
  // historial pero no está en el CRM»). Sus gestiones de mayo estaban, en los
  // expedientes históricos del mismo cliente; dentro del expediente nuevo solo
  // se veía lo suyo, y el botón para ver lo demás no decía que había algo.
  const deOtrosExpedientes = oportunidadActualId ? eventos.filter((e) => e.expediente !== oportunidadActualId) : [];
  const ultimaDeOtros = deOtrosExpedientes.reduce<string | null>((m, e) => (!m || e.fecha > m ? e.fecha : m), null);

  if (eventos.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin historial registrado para este cliente todavía.</p>;
  }
  // En la ficha se pinta de qué expediente es cada fila; dentro de uno solo sobra.
  const conExpediente = !filtroExpediente;

  const visibles = expandido ? filtrados : filtrados.slice(0, MOSTRADOS_INICIAL);
  const restantes = filtrados.length - visibles.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setVista("tabla")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              vista === "tabla" ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-accent",
            )}
          >
            Tabla
          </button>
          <button
            type="button"
            onClick={() => setVista("timeline")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              vista === "timeline" ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-accent",
            )}
          >
            Línea de tiempo
          </button>
        </div>

        <div className="flex flex-1 items-center gap-2 sm:flex-none">
          <div className="relative flex-1 sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en el historial…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() => setOrden((o) => (o === "reciente" ? "antiguo" : "reciente"))}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            <ArrowDownUp className="size-3.5" />
            {orden === "reciente" ? "Reciente primero" : "Antiguo primero"}
          </button>
        </div>
      </div>

      {oportunidadActualId && filtroExpediente && deOtrosExpedientes.length > 0 && (
        <button
          type="button"
          onClick={() => setFiltroExpediente(null)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-900 transition-colors hover:bg-amber-500/15 dark:text-amber-200"
        >
          <span>
            <b className="font-semibold">Este cliente ya tiene historia:</b> {deOtrosExpedientes.length}{" "}
            {deOtrosExpedientes.length === 1 ? "movimiento" : "movimientos"} en otros expedientes
            {ultimaDeOtros ? `, el último el ${fechaAgendada(ultimaDeOtros.slice(0, 10))}` : ""}.
          </span>
          <span className="inline-flex flex-none items-center gap-0.5 font-semibold">
            Ver todo el historial <ChevronRight className="size-3.5" />
          </span>
        </button>
      )}
      {oportunidadActualId ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {filtroExpediente ? "Solo lo de este expediente, desde lo que pidió el cliente." : "Toda la historia del cliente, con el color de cada expediente."}
          </span>
          <button
            type="button"
            onClick={() => setFiltroExpediente(filtroExpediente ? null : oportunidadActualId)}
            className="rounded-md border border-border px-2 py-1 font-medium text-primary hover:bg-accent"
          >
            {filtroExpediente ? "Ver todo el historial del cliente" : "Ver solo este expediente"}
          </button>
        </div>
      ) : (
        expedientes.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Expediente:</span>
            <button
              type="button"
              onClick={() => setFiltroExpediente(null)}
              className={cn(
                "rounded-full border px-2 py-0.5 font-medium",
                !filtroExpediente ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              Todos ({eventos.length})
            </button>
            {expedientes.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setFiltroExpediente(filtroExpediente === x.id ? null : x.id)}
                className={cn(
                  "rounded-full border px-2 py-0.5 font-semibold",
                  colorTipoExpediente(x.tipo),
                  filtroExpediente === x.id ? "ring-2 ring-primary ring-offset-1" : "opacity-80 hover:opacity-100",
                )}
              >
                {etiquetaTipoExpediente(x.tipo)} · desde {fechaConHora(x.primera).split(" ")[0]} ({x.n})
              </button>
            ))}
          </div>
        )
      )}

      {busqueda && (
        <p className="text-xs text-muted-foreground">
          Mostrando {filtrados.length} de {eventos.length}
        </p>
      )}

      {filtrados.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin resultados para &ldquo;{busqueda}&rdquo;.</p>
      ) : vista === "tabla" ? (
        <TablaHistorial eventos={visibles} oportunidadActualId={oportunidadActualId} conExpediente={conExpediente} />
      ) : (
        <LineaTiempoCuenta oportunidadActualId={oportunidadActualId} eventos={visibles} conExpediente={conExpediente} />
      )}

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

function TablaHistorial({ eventos, oportunidadActualId, conExpediente }: { eventos: EventoTimeline[]; oportunidadActualId?: string; conExpediente: boolean }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Fecha</TableHead>
            <TableHead>Gestión</TableHead>
            <TableHead className="w-32">Resultado</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {eventos.map((evento) => (
            <FilaHistorial key={`${evento.tipo}-${evento.id}`} evento={evento} oportunidadActualId={oportunidadActualId} conExpediente={conExpediente} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FilaHistorial({ evento, oportunidadActualId, conExpediente }: { evento: EventoTimeline; oportunidadActualId?: string; conExpediente: boolean }) {
  const router = useRouter();
  // Sin `!= null` la fila prometía navegación que no existe: en la ficha del
  // cliente no llega `oportunidadActualId`, así que las cotizaciones del
  // archivo —que no cuelgan de ninguna oportunidad— salían con cursor de
  // enlace y llevaban a /comercial/oportunidades/null.
  const navegable = evento.oportunidadId != null && evento.oportunidadId !== oportunidadActualId;

  return (
    <TableRow
      role={navegable ? "link" : undefined}
      tabIndex={navegable ? 0 : undefined}
      onClick={navegable ? () => router.push(`/comercial/oportunidades/${evento.oportunidadId}`) : undefined}
      onKeyDown={navegable ? (e) => {
        if (e.key === "Enter") router.push(`/comercial/oportunidades/${evento.oportunidadId}`);
      } : undefined}
      className={cn(
        navegable && "cursor-pointer transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        evento.tipo === "solicitud" && "bg-[#7E1210]/5",
      )}
    >
      <TableCell
        className={cn(
          "whitespace-nowrap align-top tabular-nums text-muted-foreground",
          conExpediente && evento.expediente && cn("border-l-4", bordeTipoExpediente(evento.expedienteTipo)),
          evento.tipo === "solicitud" && "border-l-4 border-l-[#7E1210]",
        )}
      >
        {fechaConHora(evento.fecha)}
      </TableCell>
      <TableCell className="min-w-0 whitespace-normal break-words align-top py-2.5">
        {conExpediente && evento.expediente && (
          <p className="mb-0.5">
            <TipoExpedienteBadge tipo={evento.expedienteTipo} />
          </p>
        )}
        {evento.tipo === "solicitud" && <CuerpoSolicitud evento={evento} />}
        {evento.tipo === "servicio" && (
          <>
            <p className="text-sm font-semibold text-sky-900 dark:text-sky-300">
              {evento.href ? (
                <a href={evento.href} onClick={(e) => e.stopPropagation()} className="hover:underline">
                  {evento.titulo}
                </a>
              ) : (
                evento.titulo
              )}
              {evento.quien && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· postventa: {evento.quien}</span>}
            </p>
            {evento.detalle && <p className="mt-0.5 text-sm text-muted-foreground">{evento.detalle}</p>}
          </>
        )}
        {evento.tipo === "actividad" && (
          <>
            <p className="text-sm font-semibold text-foreground">
              {ETIQUETA_ACTIVIDAD[evento.tipoActividad] ?? evento.tipoActividad}
              {/* Carlos, 22-09, mirando Titan: «tiene que aparecer quién lo ha
                  registrado… necesitamos saber quién está registrando esas
                  gestiones». Postventa y comercial escriben en la misma
                  historia; sin el nombre no se sabe a quién preguntarle. */}
              {evento.quien && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {evento.quien}</span>}
            </p>
            {evento.nota && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{textoLegible(evento.nota)}</p>}
            {/* A qué se comprometió el comercial en esta gestión (migración
                0056). Sin esto el historial contaba la mitad de la historia:
                se veía "envié correo de cotización" pero no el "y quedé en
                llamar el 29" — justo lo que Darwin echó en falta el 23-08. */}
            {evento.proximaAccion && (
              <p className="mt-1 text-xs text-foreground">
                <span className="text-muted-foreground">Sigue: </span>
                {evento.proximaAccion}
                {evento.proximaAccionAt && (
                  <span className="text-muted-foreground"> — {fechaAgendada(evento.proximaAccionAt, evento.proximaAccionHora)}</span>
                )}
              </p>
            )}
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
          </>
        )}
        {evento.tipo === "cotizacion" && (
          <p className="text-sm font-semibold text-foreground">
            Cotización {evento.codigo ?? "—"}{" "}
            <span className="font-normal text-muted-foreground">
              {/* Las del archivo no siempre traen total: el documento listaba
                  alternativas para que el cliente eligiera. Se dice eso en vez
                  de mostrar un cero que se leería como "cotizó gratis". */}
              — {evento.monto != null ? `${evento.moneda} ${evento.monto.toLocaleString("es-PE")}` : evento.montoReservado ? "monto reservado" : "sin total en el documento"}
            </span>
          </p>
        )}
        {evento.tipo === "venta" && (
          <p className="text-sm font-semibold text-[#1E7F4F]">
            Venta cerrada{evento.monto != null ? ` — ${evento.moneda} ${evento.monto.toLocaleString("es-PE")}` : ""}
            {evento.presupuesto && (
              <span className="font-normal text-muted-foreground"> · presupuesto {evento.presupuesto}</span>
            )}
          </p>
        )}
        {evento.tipo !== "actividad" && evento.tipo !== "solicitud" && evento.pdfUrl && (
          <p className="mt-1">
            <a
              href={evento.pdfUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
            >
              <FileText className="size-3" />
              {evento.tipo === "venta" ? "Ver el presupuesto" : evento.tipo === "cotizacion" && evento.montoReservado ? "Ver PDF (sin montos)" : "Ver PDF"}
            </a>
          </p>
        )}
      </TableCell>
      <TableCell className="align-top">
        {evento.tipo === "actividad" &&
          (evento.resultado ? (
            <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
              {evento.resultado.nombre}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ))}
        {evento.tipo === "cotizacion" && (
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", COLOR_COTIZACION[evento.color])}>
            {evento.estadoLabel}
          </span>
        )}
        {evento.tipo === "venta" && (
          <span className="inline-flex rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 text-[11px] font-semibold text-[#1E7F4F]">
            Venta
          </span>
        )}
        {evento.tipo === "solicitud" && (
          <span className="inline-flex rounded-full bg-[#7E1210]/10 px-2 py-0.5 text-[11px] font-semibold text-[#7E1210] dark:text-rose-300">
            {evento.volvio ? "Volvió a escribir" : "Inicio"}
          </span>
        )}
      </TableCell>
      <TableCell className="align-top">
        {/* Solo donde de verdad se puede entrar: el chevrón en todas las filas
            invitaba a hacer clic en las del archivo, que no llevan a ninguna
            parte. */}
        {navegable && <ChevronRight className="size-4 text-muted-foreground" />}
      </TableCell>
    </TableRow>
  );
}
