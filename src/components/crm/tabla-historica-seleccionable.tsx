"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckSquare, Square } from "lucide-react";
import { cerrarPedidosAntiguosComoEntregados } from "@/lib/acciones/postventa";
import { fechaLima, fechaCalendario } from "@/lib/fechas";
import { etiquetaTipoServicio, type ServicioPostventa } from "@/lib/postventa";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * LOS PEDIDOS «ANTERIORES AL CIRCUITO», DEPURADOS EN BLOQUE (ítem 10, 22-09).
 *
 * Rubí tiene ~59 filas del Excel que ya se entregaron, pero nadie les marcó
 * el check porque no traen el flujo digital de los pedidos nacidos en el
 * CRM. Antes había que abrir cada una para cerrarla a mano; esto la deja
 * limpiar la cola en una tarde: se marcan las que ya se sabe que salieron,
 * se pone la fecha y se cierran todas juntas.
 */
export function TablaHistoricaSeleccionable({ filas, verPrecios }: { filas: ServicioPostventa[]; verPrecios: boolean }) {
  const router = useRouter();
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [fecha, setFecha] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
  const [enviando, startTransition] = useTransition();

  const pendientes = filas.filter((s) => !s.completado);
  const todosElegidos = pendientes.length > 0 && pendientes.every((s) => elegidos.has(s.id));

  function alternar(id: string) {
    setElegidos((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function alternarTodos() {
    setElegidos(todosElegidos ? new Set() : new Set(pendientes.map((s) => s.id)));
  }

  function cerrarElegidos() {
    if (elegidos.size === 0) return;
    startTransition(async () => {
      const r = await cerrarPedidosAntiguosComoEntregados([...elegidos], fecha);
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(`${r.cerrados ?? 0} pedido(s) cerrado(s) como entregado(s)`);
      setElegidos(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {pendientes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/30 px-2.5 py-2">
          <button
            type="button"
            onClick={alternarTodos}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary"
          >
            {todosElegidos ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
            Elegir todos ({pendientes.length})
          </button>
          <span className="text-xs text-muted-foreground">{elegidos.size} elegido(s)</span>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Se entregaron el</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
            />
            <button
              type="button"
              onClick={cerrarElegidos}
              disabled={elegidos.size === 0 || enviando}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:bg-primary/90 disabled:opacity-60"
            >
              {enviando ? "Cerrando…" : `Cerrar como entregado (${elegidos.size})`}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table className="min-w-[1150px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Cliente</TableHead>
              <TableHead>Equipo</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead>Ubicación</TableHead>
              {verPrecios && <TableHead className="text-right">Monto</TableHead>}
              <TableHead>Abono</TableHead>
              <TableHead>Prueba</TableHead>
              <TableHead>Despacho</TableHead>
              <TableHead>Planos</TableHead>
              <TableHead>Puesta en marcha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((s) => (
              <TableRow key={s.id} className={cn(s.completado && "opacity-50")}>
                <TableCell className="align-top">
                  {!s.completado && (
                    <button type="button" onClick={() => alternar(s.id)} className="text-muted-foreground hover:text-primary">
                      {elegidos.has(s.id) ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                    </button>
                  )}
                </TableCell>
                <TableCell className="max-w-[220px] align-top text-xs font-medium whitespace-normal break-words">
                  {s.cliente_texto ?? "—"}
                  {s.fecha_confirmacion && (
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      compra {fechaCalendario(s.fecha_confirmacion)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-[260px] align-top text-[11px] text-muted-foreground">
                  <span className="line-clamp-4 whitespace-pre-line">{s.equipo ?? "—"}</span>
                </TableCell>
                <TableCell className="align-top text-xs">{etiquetaTipoServicio(s.tipo_servicio)}</TableCell>
                <TableCell className="max-w-[160px] align-top text-[11px] text-muted-foreground whitespace-normal break-words">
                  {s.ubicacion ?? "—"}
                </TableCell>
                {verPrecios && (
                  <TableCell className="align-top text-right text-xs tabular-nums">
                    {s.monto != null ? `${s.moneda} ${Number(s.monto).toLocaleString("es-PE")}` : "—"}
                  </TableCell>
                )}
                <TableCell className="align-top text-xs">{s.confirmacion_abono ?? "—"}</TableCell>
                <TableCell className="align-top text-xs">{s.prueba_embalaje ?? "—"}</TableCell>
                <TableCell className="align-top text-xs tabular-nums">
                  {s.fecha_despacho ? fechaLima(s.fecha_despacho) : (s.despacho_nota ?? "—")}
                </TableCell>
                <TableCell className="align-top text-xs">{s.planos_preinstalacion ?? "—"}</TableCell>
                <TableCell className="align-top text-xs">
                  {s.puesta_en_marcha ? fechaLima(s.puesta_en_marcha) : (s.puesta_nota ?? "—")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
