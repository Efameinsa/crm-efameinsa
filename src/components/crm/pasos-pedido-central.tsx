"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, FileText, Loader2, PackageSearch, Printer } from "lucide-react";
import { liberarPedido } from "@/lib/acciones/postventa";
import { guardarNumeroPedido, pedirSeriesAlAlmacen, prepararPedido } from "@/lib/acciones/pedido-central";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { cn } from "@/lib/utils";

/**
 * DEL CIERRE AL PEDIDO, EN CUATRO PASOS (0290; Santos con el Ing. Carlos,
 * 23-09 14:58). El procedimiento que Carlos dictó, en el orden en que se hace:
 *
 *  1. Las series: «darle clic… se lo pide al almacén; el almacén ingresa la
 *     serie, está bloqueada, ¡pum!, aparece acá».
 *  2. El pedido: «ingreso el número… el cierre, yo como Central lo convierto
 *     en pedido… me sale para imprimir el pedido».
 *  3. La liquidación: Finanzas la sube en PDF; Central la ve y la marca.
 *  4. Pedido ejecutado: «para que lo mandemos a todas las áreas».
 *
 * Decisión de Santos (23-09): se puede ejecutar sin todas las series; el
 * pedido sale con «serie pendiente» y postventa lo ve.
 */
export function PasosPedidoCentral({
  informeId,
  servicioId,
  numeroPedido,
  seriesPedidasAt,
  series,
  liquidacionAt,
  liquidacionPdf,
  pedidoEjecutadoAt,
}: {
  informeId: string;
  servicioId: string | null;
  numeroPedido: string | null;
  seriesPedidasAt: string | null;
  series: { con: number; total: number };
  liquidacionAt: string | null;
  liquidacionPdf: { url: string; nombre: string; subidaAt: string } | null;
  pedidoEjecutadoAt: string | null;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [numero, setNumero] = useState(numeroPedido ?? "");
  const [pin, setPin] = useState("");

  const correr = (fn: () => Promise<{ error: string | null }>, exito: string) =>
    startTransition(async () => {
      const r = await fn();
      if (r.error) return void toast.error(r.error, { duration: 9000 });
      toast.success(exito);
      router.refresh();
    });

  const seriesListas = series.total > 0 && series.con === series.total;
  const faltanSeries = series.total - series.con;
  const cuando = (iso: string) => new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <ol className="mt-3 grid gap-2 lg:grid-cols-4">
      {/* 1 · SERIES */}
      <Paso n={1} titulo="Series de los equipos" hecho={seriesListas}>
        {!servicioId ? (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" disabled={pendiente} onClick={() => correr(() => pedirSeriesAlAlmacen(informeId), "Pedido al almacén: le llegó el aviso con los equipos")}>
              <PackageSearch className="size-3.5" /> Pedir series al almacén
            </Button>
            <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => correr(() => prepararPedido(informeId), "Lista de equipos lista: escriba las series abajo")}>
              Las escribo yo
            </Button>
          </div>
        ) : (
          <>
            <p className="text-xs text-foreground">
              <b className="tabular-nums">{series.con} de {series.total}</b> con serie
            </p>
            {seriesPedidasAt ? (
              <p className="text-[11px] text-muted-foreground">Pedidas al almacén el {cuando(seriesPedidasAt)}{seriesListas ? "" : " · esperando"}</p>
            ) : (
              !seriesListas && (
                <Button size="sm" variant="outline" className="mt-1" disabled={pendiente} onClick={() => correr(() => pedirSeriesAlAlmacen(informeId), "Pedido al almacén: le llegó el aviso")}>
                  <PackageSearch className="size-3.5" /> Pedir al almacén
                </Button>
              )
            )}
          </>
        )}
      </Paso>

      {/* 2 · PEDIDO */}
      <Paso n={2} titulo="Pedido del ERP" hecho={Boolean(numeroPedido)}>
        {numeroPedido ? (
          <>
            <p className="text-xs text-foreground">
              Pedido <b className="font-mono">{numeroPedido}</b>
            </p>
            {servicioId && (
              <a href={`/pedidos/${servicioId}/imprimir`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Printer className="size-3.5" /> Imprimir el pedido
              </a>
            )}
          </>
        ) : (
          <div className="flex gap-1.5">
            <Input className="h-8 text-xs" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="N.º en el ERP" />
            <Button size="sm" disabled={pendiente || !numero.trim()} onClick={() => correr(() => guardarNumeroPedido(informeId, numero), "Pedido anotado: ya se puede imprimir")}>
              Guardar
            </Button>
          </div>
        )}
      </Paso>

      {/* 3 · LIQUIDACIÓN */}
      <Paso n={3} titulo="Liquidación de Finanzas" hecho={Boolean(liquidacionAt)}>
        {liquidacionPdf ? (
          <a href={liquidacionPdf.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            <FileText className="size-3.5" /> Ver la liquidación ({cuando(liquidacionPdf.subidaAt)})
          </a>
        ) : (
          !liquidacionAt && <p className="text-[11px] text-muted-foreground">Finanzas todavía no la subió.</p>
        )}
        {liquidacionAt ? (
          <p className="text-[11px] text-[#1E7F4F]">Marcada el {cuando(liquidacionAt)}</p>
        ) : (
          <Button
            size="sm"
            variant={liquidacionPdf ? "default" : "outline"}
            className="mt-1"
            disabled={pendiente}
            onClick={() => correr(() => liberarPedido({ informeId, marcarLiquidacion: true }), "Liquidación marcada")}
          >
            Marcar liquidación
          </Button>
        )}
      </Paso>

      {/* 4 · EJECUTADO */}
      <Paso n={4} titulo="Pedido ejecutado" hecho={Boolean(pedidoEjecutadoAt)}>
        {pedidoEjecutadoAt ? (
          <p className="text-[11px] text-[#1E7F4F]">Ejecutado el {cuando(pedidoEjecutadoAt)}</p>
        ) : (
          <>
            {faltanSeries > 0 && servicioId && (
              <p className="text-[11px] text-amber-800">Sale con {faltanSeries} serie{faltanSeries === 1 ? "" : "s"} pendiente{faltanSeries === 1 ? "" : "s"}: postventa lo verá.</p>
            )}
            {!liquidacionAt && (
              <div className="mt-1">
                <p className="text-[11px] text-muted-foreground">Sin liquidación, con el código de gerencia u operaciones:</p>
                <CampoCodigo valor={pin} onChange={setPin} tono="amber" id={`pin-${informeId}`} />
              </div>
            )}
            <Button
              size="sm"
              className="mt-1"
              disabled={pendiente || !numeroPedido || (!liquidacionAt && pin.replace(/\D/g, "").length < 4)}
              title={!numeroPedido ? "Primero anote el N.º del pedido (paso 2)" : undefined}
              onClick={() =>
                correr(
                  () => liberarPedido({ informeId, numeroPedido, marcarPedido: true, pin: liquidacionAt ? null : pin }),
                  liquidacionAt ? "Pedido liberado: ya lo tienen postventa, el almacén y Finanzas" : "Pedido ejecutado con código. Falta la liquidación.",
                )
              }
            >
              {pendiente && <Loader2 className="size-4 animate-spin" />}
              Marcar ejecutado
            </Button>
          </>
        )}
      </Paso>
    </ol>
  );
}

function Paso({ n, titulo, hecho, children }: { n: number; titulo: string; hecho: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("rounded-lg border p-2.5", hecho ? "border-[#1E7F4F]/30 bg-[#1E7F4F]/5" : "border-border bg-background")}>
      <p className={cn("mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide", hecho ? "text-[#1E7F4F]" : "text-foreground")}>
        <span className={cn("flex size-4 items-center justify-center rounded-full text-[10px]", hecho ? "bg-[#1E7F4F] text-white" : "border border-foreground/40")}>
          {hecho ? <Check className="size-3" /> : n}
        </span>
        {titulo}
      </p>
      {children}
    </li>
  );
}
