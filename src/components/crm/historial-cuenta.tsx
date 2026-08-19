"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowDownUp, ChevronRight } from "lucide-react";
import {
  LineaTiempoCuenta,
  ETIQUETA_ACTIVIDAD,
  COLOR_COTIZACION,
  type EventoTimeline,
} from "@/components/crm/linea-tiempo-cuenta";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

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
  return "venta cerrada";
}

// La vista por defecto de la ficha del cliente: el vendedor que recibe una
// cartera reasignada llega con la pregunta del Excel que usaban antes —
// "cuéntame la historia de este cliente" — y eso lo responde mejor una
// tabla densa con la nota completa que una timeline con aire entre eventos.
export function HistorialCuenta({ eventos }: { eventos: EventoTimeline[] }) {
  const [vista, setVista] = useState<"tabla" | "timeline">("tabla");
  const [orden, setOrden] = useState<"reciente" | "antiguo">("reciente");
  const [busqueda, setBusqueda] = useState("");
  const [expandido, setExpandido] = useState(false);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = q ? eventos.filter((e) => textoBuscable(e).includes(q)) : eventos;
    // `eventos` llega ordenado descendente (reciente primero) desde el servidor.
    return orden === "reciente" ? base : [...base].reverse();
  }, [eventos, busqueda, orden]);

  if (eventos.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin historial registrado para este cliente todavía.</p>;
  }

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

      {busqueda && (
        <p className="text-xs text-muted-foreground">
          Mostrando {filtrados.length} de {eventos.length}
        </p>
      )}

      {filtrados.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin resultados para &ldquo;{busqueda}&rdquo;.</p>
      ) : vista === "tabla" ? (
        <TablaHistorial eventos={visibles} />
      ) : (
        <LineaTiempoCuenta eventos={visibles} />
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

function TablaHistorial({ eventos }: { eventos: EventoTimeline[] }) {
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
            <FilaHistorial key={`${evento.tipo}-${evento.id}`} evento={evento} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FilaHistorial({ evento }: { evento: EventoTimeline }) {
  const router = useRouter();

  return (
    <TableRow
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/comercial/oportunidades/${evento.oportunidadId}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(`/comercial/oportunidades/${evento.oportunidadId}`);
      }}
      className="cursor-pointer transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      <TableCell className="whitespace-nowrap align-top tabular-nums text-muted-foreground">
        {new Date(evento.fecha).toLocaleDateString("es-PE")}
      </TableCell>
      <TableCell className="align-top py-2.5">
        {evento.tipo === "actividad" && (
          <>
            <p className="text-sm font-semibold text-foreground">
              {ETIQUETA_ACTIVIDAD[evento.tipoActividad] ?? evento.tipoActividad}
            </p>
            {evento.nota && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{evento.nota}</p>}
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
              — {evento.moneda} {evento.monto.toLocaleString("es-PE")}
            </span>
          </p>
        )}
        {evento.tipo === "venta" && (
          <p className="text-sm font-semibold text-[#1E7F4F]">
            Venta cerrada — {evento.moneda} {evento.monto.toLocaleString("es-PE")}
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
      </TableCell>
      <TableCell className="align-top">
        <ChevronRight className="size-4 text-muted-foreground" />
      </TableCell>
    </TableRow>
  );
}
