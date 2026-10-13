"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { devolverCotizacionPorItems, resolverAprobacionCotizacion } from "@/lib/acciones/cotizaciones";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface ItemAprobacion {
  id: string;
  nombre: string;
  cantidad: number;
  /** Precio contra el que se mide la rebaja (migración 0074). */
  precioLista: number | null;
  precioUnitario: number;
  /** Cuando el precio se pactó CON IGV (0233): gerencia ve la cifra que se negoció. */
  precioConIgv?: number | null;
  bajoLista: boolean;
  /** Gerencia tiene que decidir sobre este equipo. Desde la migración 0074 eso
   *  significa una sola cosa: el precio pedido está por debajo de la
   *  referencia. */
  requiereAprobacion: boolean;
  esIndustrial: boolean;
  /** Para que gerencia VEA qué máquina está aprobando (pedido 25-08: revisó
   *  el coche CO408 y preguntó por la imagen — la vista nunca la tuvo). */
  fotoPath?: string | null;
  /** Piezas del kit cuya cantidad se cambió en esta cotización: «DUCTO FLEXIBLE 4": 3 → 10 METROS» (0405). */
  kitCambiado?: string[];
  /** Gerencia ya lo aprobó en una vuelta anterior y no cambió (0458): sale marcado «Aprobar». */
  aprobadoAntes?: boolean;
}

/**
 * Revisión equipo por equipo, como la pidió el ing. Carlos el 24-08:
 * «me despliega en los 5 ítems. El ítem 1 solamente quiere aprobar, porque los
 * otros 4 le están mandando el precio normal».
 *
 * QUÉ SE DECIDE ACÁ: solo los equipos que van POR DEBAJO del precio de
 * referencia. Ser industrial ya no basta — Carlos lo revirtió el 25-08:
 * «coticemos el precio de lista nada más; la función debería ser cuando quieres
 * reducir ese precio» (migración 0074).
 *
 * POR QUÉ LA COMPARACIÓN SE VE ASÍ DE GRANDE. Con la regla anterior le llegaban
 * industriales cotizados al precio de lista, y la pantalla mostraba referencia y
 * pedido como dos datos chiquitos y parejos. Su reacción, mirándolo en vivo:
 * «me aparece el precio base, precio de lista $8,999, pero YO NO SÉ QUÉ PRECIO
 * ME ESTÁS PIDIENDO». Ahora los dos números y la rebaja —en plata y en
 * porcentaje— son lo primero que se ve de cada equipo.
 */
export function AprobarCotizacionBotones({
  cotizacionId,
  moneda,
  items,
  porCapacitacion = false,
  porLineaAMano = false,
}: {
  cotizacionId: string;
  moneda: string;
  items: ItemAprobacion[];
  /** Cotización de postventa en capacitación (0396): todo pasa por gerencia. */
  porCapacitacion?: boolean;
  /** Líneas escritas a mano con precio (0440): no tienen lista contra la que medirse. */
  porLineaAMano?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  // true = aprobado, false = a corregir. Lo ya aprobado en una vuelta anterior
  // (y que no cambió) llega marcado: gerencia solo mira lo corregido (0458).
  const [decisiones, setDecisiones] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.filter((i) => i.requiereAprobacion && i.aprobadoAntes).map((i) => [i.id, true])),
  );
  const [notasItem, setNotasItem] = useState<Record<string, string>>({});
  // Rechazar la cotización ENTERA como histórico (0237, Carlos 15-09) sigue
  // existiendo, pero ya no es lo que pasa por defecto: se devuelven los
  // renglones marcados y el borrador queda (reunión de postventa 13-10).
  const [rechazarToda, setRechazarToda] = useState(false);
  const [enviando, startTransition] = useTransition();

  const porDecidir = useMemo(() => items.filter((i) => i.requiereAprobacion), [items]);
  const sinDecidir = porDecidir.filter((i) => !(i.id in decisiones));
  const rechazados = porDecidir.filter((i) => decisiones[i.id] === false);
  const sinComentario = rechazarToda ? [] : rechazados.filter((i) => (notasItem[i.id] ?? "").trim().length < 3);
  const faltaNota = rechazados.length > 0 && (rechazarToda ? !nota.trim() : sinComentario.length > 0);

  function decidir(id: string, aprobado: boolean) {
    setDecisiones((d) => ({ ...d, [id]: aprobado }));
  }

  function guardar() {
    if (sinDecidir.length > 0) {
      toast.error(`Falta decidir ${sinDecidir.length} renglón(es)`);
      return;
    }
    const aprobados = porDecidir.filter((i) => decisiones[i.id]).map((i) => i.id);
    const devolver = rechazados.length > 0 && !rechazarToda;
    startTransition(async () => {
      const r = devolver
        ? await devolverCotizacionPorItems({
            cotizacionId,
            aprobados,
            corregir: rechazados.map((i) => ({ id: i.id, nota: notasItem[i.id] ?? "" })),
            nota,
          })
        : await resolverAprobacionCotizacion({
            cotizacionId,
            aprobados,
            rechazados: rechazados.map((i) => i.id),
            nota,
          });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(
        devolver
          ? `Devuelta para corregir ${rechazados.length} renglón(es): el borrador se conserva`
          : rechazados.length > 0
            ? "Cotización rechazada: queda como histórico"
            : "Precios aprobados — el comercial ya puede enviarla",
      );
      setAbierto(false);
      router.refresh();
    });
  }

  const monto = (n: number) => `${moneda} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="sm">Revisar</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Revisar renglón por renglón</DialogTitle>
          <DialogDescription>
            {porCapacitacion ? (
              <>
                Es de <b>postventa</b>: mientras dure su capacitación, toda cotización del área pasa por
                gerencia, esté por encima o por debajo del precio de catálogo. Decida cada renglón.
              </>
            ) : porLineaAMano ? (
              <>
                Tiene <b>líneas escritas a mano con precio</b> (servicios u otros conceptos fuera del
                catálogo): no hay precio de lista contra el que medirlas, así que pasan por gerencia antes de
                que la comercial la confirme y le ponga número. Apruebe o mande a corregir cada renglón.
              </>
            ) : (
              <>
                Solo se decide sobre los equipos cotizados <b>por debajo del precio de referencia</b>. Al
                precio de referencia o por encima, el comercial cotiza y envía sin pedir permiso, sea
                industrial o semi-industrial.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {items.map((i) => {
            const decision = decisiones[i.id];
            const diferencia = i.precioLista != null ? i.precioUnitario - i.precioLista : null;
            return (
              <div
                key={i.id}
                className={cn(
                  "rounded-lg border p-3",
                  !i.requiereAprobacion && "border-border bg-secondary/40",
                  i.requiereAprobacion && decision === true && "border-[#1E7F4F]/50 bg-[#1E7F4F]/5",
                  i.requiereAprobacion && decision === false && "border-destructive/50 bg-destructive/5",
                  i.requiereAprobacion && decision === undefined && "border-amber-500/50 bg-amber-500/5",
                )}
              >
                <div className="flex items-start gap-2.5">
                {i.fotoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto local chica
                  <img src={i.fotoPath} alt="" loading="lazy" className="size-14 flex-none rounded-md border border-border bg-white object-contain p-0.5" />
                ) : (
                  <span className="flex size-14 flex-none items-center justify-center rounded-md bg-secondary text-[9px] text-muted-foreground">sin foto</span>
                )}
                <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {i.cantidad > 1 && <span className="text-muted-foreground">{i.cantidad} × </span>}
                  {i.nombre}
                  <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {i.esIndustrial ? "Industrial" : "Semi-industrial"}
                  </span>
                </p>
                {(i.kitCambiado?.length ?? 0) > 0 && (
                  <div className="mt-1 rounded-md border border-amber-400/60 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-900">
                    <b>Kit con cantidades cambiadas:</b> {i.kitCambiado!.join(" · ")}
                  </div>
                )}

                {/* Referencia contra lo que piden, uno al lado del otro. Es el
                    pedido textual del 25-08: «la vista del gerente debe ver
                    cuál es el precio de referencia vs el precio reducido». */}
                <div className="mt-2 grid grid-cols-3 gap-2 text-center tabular-nums">
                  <div className="rounded-md bg-secondary/60 px-2 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Referencia
                    </p>
                    <p className="text-sm text-foreground">
                      {i.precioLista != null ? monto(i.precioLista) : "sin precio cargado"}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded-md px-2 py-1.5",
                      i.bajoLista ? "bg-destructive/10" : "bg-secondary/60",
                    )}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Piden
                    </p>
                    <p
                      className={cn(
                        "text-sm font-bold",
                        i.bajoLista ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {monto(i.precioUnitario)}
                    </p>
                    {i.precioConIgv != null && (
                      <p className="text-[10px] text-muted-foreground">{monto(i.precioConIgv)} con IGV</p>
                    )}
                  </div>
                  <div className="rounded-md bg-secondary/60 px-2 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Diferencia
                    </p>
                    {diferencia == null || diferencia === 0 ? (
                      <p className="text-sm text-muted-foreground">—</p>
                    ) : (
                      <p
                        className={cn(
                          "text-sm font-bold",
                          diferencia < 0 ? "text-destructive" : "text-[#1E7F4F]",
                        )}
                      >
                        {diferencia < 0 ? "−" : "+"}
                        {monto(Math.abs(diferencia))}
                        {i.precioLista ? (
                          <span className="block text-[11px] font-semibold">
                            {diferencia < 0 ? "−" : "+"}
                            {Math.abs((diferencia / i.precioLista) * 100).toLocaleString("es-PE", {
                              maximumFractionDigits: 1,
                            })}{" "}
                            %
                          </span>
                        ) : null}
                      </p>
                    )}
                  </div>
                </div>
                {i.cantidad > 1 && diferencia != null && diferencia < 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Por las {i.cantidad} unidades se ceden {monto(Math.abs(diferencia) * i.cantidad)}.
                  </p>
                )}

                {i.requiereAprobacion ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={decision === true ? "default" : "outline"}
                      onClick={() => decidir(i.id, true)}
                    >
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant={decision === false ? "destructive" : "outline"}
                      onClick={() => decidir(i.id, false)}
                    >
                      Corregir
                    </Button>
                    {i.aprobadoAntes && decision === true && (
                      <span className="text-[11px] text-muted-foreground">ya aprobado en la vuelta anterior</span>
                    )}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Al precio de referencia o por encima — no necesita su aprobación
                  </p>
                )}
                {i.requiereAprobacion && decision === false && !rechazarToda && (
                  <Textarea
                    aria-label={`Qué corregir en ${i.nombre}`}
                    value={notasItem[i.id] ?? ""}
                    onChange={(e) => setNotasItem((n) => ({ ...n, [i.id]: e.target.value }))}
                    rows={2}
                    placeholder="Qué corregir en este renglón. Ej.: corregir el precio, se puede bajar hasta 3800."
                    className={cn(
                      "mt-2 bg-card",
                      (notasItem[i.id] ?? "").trim().length < 3 && "border-destructive focus-visible:border-destructive",
                    )}
                  />
                )}
                </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          {rechazados.length > 0 && (
            <label className="flex items-start gap-2 rounded-md border border-border p-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={rechazarToda}
                onChange={(e) => setRechazarToda(e.target.checked)}
              />
              <span>
                <b className="text-foreground">Rechazar la cotización entera</b> (queda como histórico y hay que hacer
                otra). Sin marcar, se devuelven solo los renglones a corregir y el borrador se conserva.
              </span>
            </label>
          )}
          <Label htmlFor="nota">
            {rechazarToda && rechazados.length > 0 ? "Nota (obligatoria al rechazar)" : "Nota general (opcional)"}
          </Label>
          <Textarea
            id="nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder={
              rechazados.length > 0 && rechazarToda
                ? "Por qué se rechaza. Ej.: se puede bajar hasta 3800 por unidad, no más."
                : "Opcional: un comentario para toda la cotización."
            }
            rows={2}
            // Rechazar sin decir por qué no sirve de nada: el comercial vuelve
            // a cotizar a ciegas. Se marca el campo en vez de dejar que el
            // botón falle después (29-08).
            className={cn(faltaNota && "border-destructive focus-visible:border-destructive")}
          />
        </div>

        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">
            {sinDecidir.length > 0
              ? `Falta decidir ${sinDecidir.length} renglón(es)`
              : faltaNota
                ? rechazarToda
                  ? "Escriba por qué se rechaza"
                  : "Escriba qué corregir en cada renglón marcado"
                : rechazados.length > 0
                  ? rechazarToda
                    ? "Se rechaza entera"
                    : `${rechazados.length} por corregir · el borrador se conserva`
                  : "Todo aprobado"}
          </span>
          <Button disabled={enviando || sinDecidir.length > 0 || faltaNota} onClick={guardar}>
            {rechazados.length > 0 && !rechazarToda ? "Devolver para corregir" : "Guardar decisión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
