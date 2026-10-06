"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, Check, FileText, Loader2, PackageSearch, Printer, X } from "lucide-react";
import { liberarPedido } from "@/lib/acciones/postventa";
import { apurarDesdeCentral, generarPedido, pedirSeriesAlAlmacen, prepararPedido, rechazarLiquidacion } from "@/lib/acciones/pedido-central";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { EntregarFileDirecto } from "@/components/crm/files-acciones";
import type { EmpresaFile } from "@/lib/acciones/files";
import { cn } from "@/lib/utils";

/**
 * DEL CIERRE AL PEDIDO, EN CUATRO PASOS (0290; Santos con el Ing. Carlos,
 * 23-09 14:58). El procedimiento que Carlos dictó, en el orden en que se hace:
 *
 *  1. Las series: «darle clic… se lo pide al almacén; el almacén ingresa la
 *     serie, está bloqueada, ¡pum!, aparece acá».
 *  2. El pedido: Central lo genera y el CRM le pone el número (0295; en la
 *     prueba del 23-09 17:24 Carlos retiró el paso del ERP). Se imprime como
 *     anexo del cierre, que no se toca.
 *  3. La liquidación: Finanzas la sube en PDF; Central la acepta o la
 *     rechaza con el motivo y vuelve a Finanzas (0295).
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
  liquidacionRechazo = null,
  pedidoEjecutadoAt,
  apuroAlmacen = null,
  apuroFinanzas = null,
  cliente = null,
  fileEntregado = null,
  regularizado = false,
}: {
  informeId: string;
  servicioId: string | null;
  numeroPedido: string | null;
  seriesPedidasAt: string | null;
  series: { con: number; total: number };
  liquidacionAt: string | null;
  liquidacionPdf: { url: string; nombre: string; subidaAt: string } | null;
  /** La última vez que Central la devolvió a Finanzas, si todavía no llega la corregida. */
  liquidacionRechazo?: { motivo: string; at: string } | null;
  pedidoEjecutadoAt: string | null;
  /** El último «Apurar» de Central a cada área y cuántos van (0358). */
  apuroAlmacen?: { at: string; n: number } | null;
  apuroFinanzas?: { at: string; n: number } | null;
  /** El cliente del cierre y su empresa, para entregar el file con el pedido (0365). */
  cliente?: { cuentaId: string; nombre: string; empresa: EmpresaFile | null } | null;
  /** El file que Central ya entregó con este pedido y sigue fuera del archivador (0365). */
  fileEntregado?: { a: string; at: string; recibido: boolean } | null;
  /** Cierre en Word anterior al CRM (REG, 0397): el almacén ya entregó, las series las copia Central. */
  regularizado?: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [pin, setPin] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");

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
        {!servicioId && regularizado ? (
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">
              REG: el almacén ya entregó. Verifique las series en las máquinas del cliente y cópielas usted; no se le piden al almacén.
            </p>
            <Button size="sm" disabled={pendiente} onClick={() => correr(() => prepararPedido(informeId), "Lista de equipos lista: copie las series abajo")}>
              Las escribo yo
            </Button>
          </div>
        ) : !servicioId ? (
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
              <>
                <p className="text-[11px] text-muted-foreground">Pedidas al almacén el {cuando(seriesPedidasAt)}{seriesListas ? "" : " · esperando"}</p>
                {!seriesListas && (
                  <Apurar
                    etiqueta="Apurar al almacén"
                    ultimo={apuroAlmacen}
                    disabled={pendiente}
                    onClick={() => correr(() => apurarDesdeCentral(servicioId, "almacen"), "Al almacén le sonó la alarma")}
                  />
                )}
              </>
            ) : (
              !seriesListas && !regularizado && (
                <Button size="sm" variant="outline" className="mt-1" disabled={pendiente} onClick={() => correr(() => pedirSeriesAlAlmacen(informeId), "Pedido al almacén: le llegó el aviso")}>
                  <PackageSearch className="size-3.5" /> Pedir al almacén
                </Button>
              )
            )}
          </>
        )}
      </Paso>

      {/* 2 · PEDIDO: lo genera Central, el número lo pone el CRM (0295) */}
      <Paso n={2} titulo="Generar el pedido" hecho={Boolean(numeroPedido)}>
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
            {/* El file a postventa (0365, Carlos 01-10 11:05): «yo te entrego
                porque hemos generado un pedido… no sé si lo enlazamos». */}
            {fileEntregado ? (
              <p className="mt-1 text-[11px] text-[#1E7F4F]">
                File entregado a <b>{fileEntregado.a}</b> el {cuando(fileEntregado.at)}
                {fileEntregado.recibido ? " · firmó «Recibí»" : <span className="text-amber-800"> · falta que firme «Recibí»</span>}
              </p>
            ) : (
              servicioId &&
              cliente && <EntregarFileDirecto pedido={{ servicioId, numero: numeroPedido, cuentaId: cliente.cuentaId, cliente: cliente.nombre, empresa: cliente.empresa }} />
            )}
          </>
        ) : regularizado && (!servicioId || faltanSeries > 0) ? (
          // REG (0403, Santos 06-10): el almacén ya entregó y nadie más va a
          // escribir las series; sin ellas el pedido no se genera.
          <>
            <Button size="sm" disabled>
              <FileText className="size-3.5" /> Generar el pedido
            </Button>
            <p className="mt-1 text-[11px] text-amber-800">
              {!servicioId
                ? "REG: primero «Las escribo yo» (paso 1) y copie las series."
                : `REG: ${faltanSeries === 1 ? "falta una serie" : `faltan ${faltanSeries} series`}. Cópiela${faltanSeries === 1 ? "" : "s"} abajo, en «Equipos de este pedido».`}
            </p>
          </>
        ) : (
          <>
            <Button size="sm" disabled={pendiente} onClick={() => correr(() => generarPedido(informeId), "Pedido generado: ya se puede imprimir")}>
              <FileText className="size-3.5" /> Generar el pedido
            </Button>
            {servicioId && !seriesListas && (
              <p className="mt-1 text-[11px] text-muted-foreground">Puede generarlo sin todas las series: la hoja dirá «serie pendiente».</p>
            )}
          </>
        )}
      </Paso>

      {/* 3 · LIQUIDACIÓN: Central la acepta o la rechaza (0295) */}
      <Paso n={3} titulo="Liquidación de Finanzas" hecho={Boolean(liquidacionAt)}>
        {liquidacionPdf ? (
          <a href={liquidacionPdf.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            <FileText className="size-3.5" /> Ver la liquidación ({cuando(liquidacionPdf.subidaAt)})
          </a>
        ) : liquidacionRechazo && !liquidacionAt ? (
          <p className="text-[11px] text-destructive">
            La rechazó el {cuando(liquidacionRechazo.at)}: {liquidacionRechazo.motivo}. Esperando la corregida de Finanzas.
          </p>
        ) : (
          !liquidacionAt && (
            <>
              <p className="text-[11px] text-muted-foreground">Finanzas todavía no la subió.</p>
              {/* Finanzas solo ve en «Liquidar» los pedidos con número (paso 2). */}
              {numeroPedido && servicioId ? (
                <Apurar
                  etiqueta="Apurar a Finanzas"
                  ultimo={apuroFinanzas}
                  disabled={pendiente}
                  onClick={() => correr(() => apurarDesdeCentral(servicioId, "finanzas"), "A Finanzas le sonó la alarma")}
                />
              ) : (
                <p className="text-[11px] text-muted-foreground">Para apurar a Finanzas, primero genere el pedido (paso 2): recién ahí lo ve.</p>
              )}
            </>
          )
        )}
        {liquidacionRechazo && !liquidacionAt && !liquidacionPdf && numeroPedido && servicioId && (
          <Apurar
            etiqueta="Apurar a Finanzas"
            ultimo={apuroFinanzas}
            disabled={pendiente}
            onClick={() => correr(() => apurarDesdeCentral(servicioId, "finanzas"), "A Finanzas le sonó la alarma")}
          />
        )}
        {liquidacionAt ? (
          <p className="text-[11px] text-[#1E7F4F]">Aceptada el {cuando(liquidacionAt)}</p>
        ) : rechazando ? (
          <div className="mt-1 grid gap-1">
            <Input className="h-8 text-xs" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Qué está mal (ej. el total no cuadra con el cierre)" autoFocus />
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="destructive"
                disabled={pendiente || motivo.trim().length < 5 || !servicioId}
                onClick={() =>
                  correr(async () => {
                    const r = await rechazarLiquidacion(servicioId!, motivo);
                    if (!r.error) {
                      setRechazando(false);
                      setMotivo("");
                    }
                    return r;
                  }, "Liquidación rechazada: volvió a Finanzas con el motivo")
                }
              >
                Rechazar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRechazando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={liquidacionPdf ? "default" : "outline"}
              // Revisión 23-09: sin el PDF de Finanzas no hay qué aceptar (antes
              // se podía saltar a Finanzas, incluso justo después de rechazarla).
              disabled={pendiente || !liquidacionPdf}
              title={!liquidacionPdf ? "Finanzas todavía no sube la liquidación" : undefined}
              onClick={() => correr(() => liberarPedido({ informeId, marcarLiquidacion: true }), "Liquidación aceptada")}
            >
              <Check className="size-3.5" /> Aceptar
            </Button>
            {liquidacionPdf && (
              <Button size="sm" variant="outline" disabled={pendiente} onClick={() => setRechazando(true)}>
                <X className="size-3.5" /> Rechazar
              </Button>
            )}
          </div>
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
            {!numeroPedido && <p className="text-[11px] text-muted-foreground">Primero genere el pedido (paso 2).</p>}
            {!liquidacionAt && numeroPedido && (
              <div className="mt-1">
                <p className="text-[11px] text-muted-foreground">Sin liquidación, con el código de gerencia u operaciones:</p>
                <CampoCodigo valor={pin} onChange={setPin} tono="amber" id={`pin-${informeId}`} />
              </div>
            )}
            <Button
              size="sm"
              className="mt-1"
              disabled={pendiente || !numeroPedido || (!liquidacionAt && pin.replace(/\D/g, "").length < 4)}
              title={!numeroPedido ? "Primero genere el pedido (paso 2)" : undefined}
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

/**
 * «Apurar» (0358, Central 30-09): la sirena al área que tiene el paso en la
 * mano. Dice cuándo fue el último apuro, para no bombardear.
 */
function Apurar({
  etiqueta,
  ultimo,
  disabled,
  onClick,
}: {
  etiqueta: string;
  ultimo: { at: string; n: number } | null;
  disabled: boolean;
  onClick: () => void;
}) {
  const hora = ultimo ? new Date(ultimo.at).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div className="mt-1.5">
      <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" disabled={disabled} onClick={onClick}>
        <BellRing className="size-3.5" /> {etiqueta}
      </Button>
      {ultimo && (
        <p className="mt-0.5 text-[11px] text-destructive">
          Apurado el {hora}
          {ultimo.n > 1 ? ` · ${ultimo.n} veces` : ""}
        </p>
      )}
    </div>
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
