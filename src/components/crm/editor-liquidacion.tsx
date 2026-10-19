"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/enlace";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Eye, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { validarLiquidacion, vistaPreviaLiquidacion } from "@/lib/acciones/liquidacion-automatica";
import {
  calcularLiquidacion,
  complementosIniciales,
  NOMBRE_RETENIDO,
  PCT_RETENIDO,
  type AjustesLiquidacion,
  type BaseLiquidacion,
  type Complementos,
  type RenglonLiquidacion,
  type TipoRetenido,
} from "@/lib/liquidacion-automatica";
import { redondear2 } from "@/lib/igv";
import { HojaLiquidacion } from "@/components/crm/hoja-liquidacion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * EL EDITOR DE LA LIQUIDACIÓN (0534; Santos, 17-10): «debe tomar información
 * de donde pueda, se jale automático, y tenga un editor de campos para
 * ajustar alguna parte que desee ajustar».
 *
 * Todo viene puesto por el CRM. Cada campo se puede corregir y la hoja de la
 * derecha se redibuja al instante. «Validar» guarda el PDF como la
 * liquidación N.º siguiente y avisa a Central (y a Contabilidad si hay un
 * abono sin factura, al comercial si falta la comisión del banco).
 */
export function EditorLiquidacion({ base, hoy }: { base: BaseLiquidacion; hoy: string }) {
  const router = useRouter();
  const [c, setC] = useState<Complementos>(() => complementosIniciales(base, hoy));
  const [pendiente, startTransition] = useTransition();
  const [mirando, startMirar] = useTransition();
  const [problema, setProblema] = useState<string | null>(null);

  const l = useMemo(() => calcularLiquidacion(base, c, hoy), [base, c, hoy]);
  const aj: AjustesLiquidacion = c.ajustes ?? {};
  const setAj = (patch: Partial<AjustesLiquidacion>) => setC((v) => ({ ...v, ajustes: { ...(v.ajustes ?? {}), ...patch } }));
  const simbolo = base.moneda === "PEN" ? "S/" : "US$";
  const m = (n: number) => `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const abonos = [...base.abonos].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.createdAt.localeCompare(y.createdAt));

  // Los renglones que se editan: los del CRM hasta que se toca uno.
  const renglones: RenglonLiquidacion[] = aj.renglones ?? base.renglones;
  function editarRenglon(i: number, patch: Partial<RenglonLiquidacion>) {
    const copia = (aj.renglones ?? copiaEditable(base)).map((r, k) => (k === i ? { ...r, ...patch } : r));
    setAj({ renglones: copia });
  }
  function quitarRenglon(i: number) {
    setAj({ renglones: (aj.renglones ?? copiaEditable(base)).filter((_, k) => k !== i) });
  }
  function agregarRenglon() {
    setAj({ renglones: [...(aj.renglones ?? copiaEditable(base)), { cantidad: 1, descripcion: "", precioUnitario: 0, importe: 0, series: [] }] });
  }

  function retenido(tipo: TipoRetenido | null) {
    setC((v) => ({
      ...v,
      retenido: tipo ? { tipo, pct: PCT_RETENIDO[tipo], monto: redondear2((l.base.total * PCT_RETENIDO[tipo]) / 100), cobrado: v.retenido?.cobrado ?? false } : null,
    }));
  }

  function verPdf() {
    setProblema(null);
    startMirar(async () => {
      const r = await vistaPreviaLiquidacion(base.servicioId, c);
      if (r.error || !r.pdf) return void setProblema(r.error ?? "No se pudo armar el PDF.");
      const bytes = Uint8Array.from(atob(r.pdf), (x) => x.charCodeAt(0));
      window.open(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), "_blank");
    });
  }

  function validar() {
    setProblema(null);
    startTransition(async () => {
      const r = await validarLiquidacion(base.servicioId, c);
      if (r.error) return void setProblema(r.error);
      toast.success(`Liquidación ${r.numero} validada: Central ya recibió el aviso`);
      router.push(`/finanzas/pedidos/${base.servicioId}`);
      router.refresh();
    });
  }

  const hayAjustes = Object.values(aj).some((v) => (v && typeof v === "object" ? Object.keys(v).length > 0 : Boolean(v)));
  const volver = `/finanzas/pedidos/${base.servicioId}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={volver} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            Volver al pedido
          </Link>
          <h1 className="mt-1 text-lg font-bold text-foreground">
            Liquidación N.º {l.numero} · {l.base.pedido}
          </h1>
          <p className="text-sm text-muted-foreground">
            {l.base.cliente} · {base.yaHay === 0 ? "primera liquidación del pedido" : `ya tiene ${base.yaHay}; esta es la siguiente`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hayAjustes && (
            <Button variant="ghost" size="sm" onClick={() => setC((v) => ({ ...v, ajustes: {} }))} disabled={pendiente}>
              <RotateCcw className="size-3.5" />
              Volver a lo del CRM
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={verPdf} disabled={mirando || pendiente}>
            {mirando ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
            Ver el PDF
          </Button>
          <Button size="sm" onClick={validar} disabled={pendiente || mirando}>
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {pendiente ? "Validando…" : "Validar y enviar a Central"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
        <b>El CRM ya llenó todo</b> con el pedido, el cierre, las series, los abonos que usted confirmó y las facturas de Contabilidad. Corrija lo que quiera
        a la izquierda: la hoja de la derecha es la que sale. Cuando esté bien, <b>«Validar y enviar a Central»</b>.
      </div>

      {problema && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
          {problema}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── IZQUIERDA: los campos ─────────────────────────────────────── */}
        <div className="space-y-3">
          <Seccion titulo="Carta" editado={Boolean(aj.fecha || aj.cliente || aj.clienteDoc || aj.pedido)}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Campo label="Fecha">
                <Input type="date" value={aj.fecha ?? hoy} onChange={(e) => setAj({ fecha: e.target.value })} className="h-8" />
              </Campo>
              <Campo label="N.º de pedido">
                <Input value={aj.pedido ?? base.pedido} onChange={(e) => setAj({ pedido: e.target.value })} className="h-8 font-mono" />
              </Campo>
              <Campo label="Cliente (Sres.)">
                <Input value={aj.cliente ?? base.cliente} onChange={(e) => setAj({ cliente: e.target.value })} className="h-8 uppercase" />
              </Campo>
              <Campo label="RUC / DNI">
                <Input value={aj.clienteDoc ?? base.clienteDoc ?? ""} onChange={(e) => setAj({ clienteDoc: e.target.value })} className="h-8 font-mono" />
              </Campo>
            </div>
          </Seccion>

          <Seccion
            titulo={base.esServicio ? "Servicios y precios" : "Equipos y precios"}
            ayuda={aj.renglones ? "Totales recalculados con lo que escribió." : "Del cierre de venta, con las series del pedido."}
            editado={Boolean(aj.renglones)}
            accion={
              <button type="button" onClick={agregarRenglon} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Plus className="size-3.5" /> Agregar línea
              </button>
            }
          >
            <div className="space-y-2">
              {renglones.map((r, i) => (
                <div key={i} className="rounded-md border border-border p-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <Campo label="Cant.">
                      <Input type="number" min={0} step="1" value={r.cantidad} onChange={(e) => editarRenglon(i, { cantidad: Number(e.target.value) })} className="h-8 w-16 text-center" />
                    </Campo>
                    <Campo label={`Precio unit. (${simbolo}, sin IGV)`}>
                      <Input type="number" min={0} step="0.01" value={r.precioUnitario} onChange={(e) => editarRenglon(i, { precioUnitario: Number(e.target.value) })} className="h-8 w-32 text-right" />
                    </Campo>
                    <div className="ml-auto text-right text-xs">
                      <p className="text-[11px] text-muted-foreground">Importe</p>
                      <p className="font-semibold tabular-nums">{m(redondear2(r.cantidad * r.precioUnitario))}</p>
                    </div>
                    <button type="button" onClick={() => quitarRenglon(i)} className="text-muted-foreground hover:text-destructive" aria-label="Quitar esta línea" title="Quitar esta línea">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <Campo label="Detalle (la primera línea sale en negrita; MARCA, MODELO… debajo)" className="mt-2">
                    <Textarea value={r.descripcion} onChange={(e) => editarRenglon(i, { descripcion: e.target.value })} rows={Math.min(8, Math.max(2, r.descripcion.split("\n").length))} className="text-xs uppercase" />
                  </Campo>
                  <Campo label="Series (una por línea)" className="mt-2">
                    <Textarea value={r.series.join("\n")} onChange={(e) => editarRenglon(i, { series: e.target.value.split("\n") })} rows={Math.max(1, r.series.length)} className="font-mono text-xs uppercase" placeholder="Sin serie todavía" />
                  </Campo>
                </div>
              ))}
              {base.series.length > 0 && !aj.renglones && (
                <p className="text-[11px] text-amber-800">
                  {base.series.length} serie{base.series.length === 1 ? "" : "s"} del pedido no se pudo{base.series.length === 1 ? "" : "ieron"} ubicar bajo un equipo: salen aparte. Si edita cualquier línea, pasan a la última.
                </p>
              )}
              <div className="flex justify-end gap-4 text-xs">
                <span>Sub total <b className="tabular-nums">{m(l.base.subtotal)}</b></span>
                <span>IGV <b className="tabular-nums">{m(l.base.igv)}</b></span>
                <span>Total <b className="tabular-nums">{m(l.base.total)}</b></span>
              </div>
            </div>
          </Seccion>

          <Seccion titulo="Abonos y facturas" ayuda="Los abonos son los que usted confirmó; acá se dice cómo se escriben y a qué factura van, y la factura de lo que falta cobrar." editado={Boolean(aj.abonos && Object.keys(aj.abonos).length)}>
            {abonos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Todavía no hay abonos confirmados{base.pagadoSinDetalle > 0 ? ` (hay ${m(base.pagadoSinDetalle)} de antes del CRM)` : ""}: la liquidación sale «pendiente de pago», para que el cliente pague con su factura.
              </p>
            ) : (
              <div className="space-y-2">
                {abonos.map((a, i) => {
                  const e = aj.abonos?.[a.id] ?? {};
                  return (
                    <div key={a.id} className="rounded-md border border-border p-2">
                      <p className="text-xs">
                        <b>Abono {i + 1}</b> · {m(a.neto + a.comision)} · {a.fecha.split("-").reverse().join("/")}
                        {a.comision > 0 && <span className="text-amber-800"> · el banco descontó {m(a.comision)}</span>}
                      </p>
                      <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                        <Campo label="Banco / medio">
                          <Input value={e.medio ?? a.medio} onChange={(ev) => setAj({ abonos: { ...(aj.abonos ?? {}), [a.id]: { ...e, medio: ev.target.value } } })} className="h-8 uppercase" placeholder="BCP ME" />
                        </Campo>
                        <Campo label="N.º de operación">
                          <Input value={e.operacion ?? a.operacion} onChange={(ev) => setAj({ abonos: { ...(aj.abonos ?? {}), [a.id]: { ...e, operacion: ev.target.value } } })} className="h-8 font-mono" />
                        </Campo>
                        <Campo label="Factura">
                          <Input
                            list={`facturas-${base.servicioId}`}
                            value={c.facturaDeAbono[a.id] ?? ""}
                            onChange={(ev) => setC((v) => ({ ...v, facturaDeAbono: { ...v.facturaDeAbono, [a.id]: ev.target.value } }))}
                            className="h-8 font-mono uppercase"
                            placeholder="Vacío = pendiente"
                          />
                        </Campo>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {l.hayCola && (
              <div className="mt-2 rounded-md border border-border p-2">
                <p className="text-xs">
                  <b>{abonos.length ? "Lo que falta cobrar" : "Toda la operación"}</b> · {m(l.bloques[l.bloques.length - 1]?.filas[0].monto ?? 0)}
                  <span className="text-muted-foreground"> · si ya se facturó (crédito, pago contra entrega), ponga aquí el número</span>
                </p>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                  <Campo label="N.º de factura">
                    <Input
                      list={`facturas-${base.servicioId}`}
                      value={c.facturaSaldo ?? ""}
                      onChange={(ev) => setC((v) => ({ ...v, facturaSaldo: ev.target.value }))}
                      className="h-8 font-mono uppercase"
                      placeholder="Vacío = FT PDTE"
                    />
                  </Campo>
                </div>
              </div>
            )}
            <datalist id={`facturas-${base.servicioId}`}>
              {base.facturas.map((f) => (
                <option key={f.numero} value={f.numero} />
              ))}
            </datalist>
            {base.facturas.length > 0 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">Facturas registradas por Contabilidad: {base.facturas.map((f) => f.numero).join(", ")}.</p>
            )}
          </Seccion>

          <Seccion titulo="Detracción o retención" ayuda="Solo si aplica. Cuenta como pagado: postventa puede despachar aunque falte cobrarla.">
            <div className="flex flex-wrap gap-1.5">
              {([null, "detraccion", "retencion"] as const).map((t) => (
                <button
                  key={t ?? "no"}
                  type="button"
                  onClick={() => retenido(t)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs",
                    (c.retenido?.tipo ?? null) === t ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {t ? `${NOMBRE_RETENIDO[t]} (${PCT_RETENIDO[t]} %)` : "No aplica"}
                </button>
              ))}
            </div>
            {c.retenido && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Campo label="%">
                  <Input
                    type="number"
                    step="0.5"
                    className="h-8 w-20"
                    value={c.retenido.pct}
                    onChange={(e) => {
                      const pct = Number(e.target.value);
                      setC((v) => ({ ...v, retenido: v.retenido && { ...v.retenido, pct, monto: redondear2((l.base.total * pct) / 100) } }));
                    }}
                  />
                </Campo>
                <Campo label={`Monto (${simbolo})`}>
                  <Input type="number" step="0.01" className="h-8 w-32" value={c.retenido.monto} onChange={(e) => setC((v) => ({ ...v, retenido: v.retenido && { ...v.retenido, monto: Number(e.target.value) } }))} />
                </Campo>
                <label className="inline-flex items-center gap-1.5 pb-1.5 text-xs">
                  <input type="checkbox" checked={c.retenido.cobrado} onChange={(e) => setC((v) => ({ ...v, retenido: v.retenido && { ...v.retenido, cobrado: e.target.checked } }))} />
                  Ya se cobró
                </label>
              </div>
            )}
          </Seccion>

          <Seccion titulo="Letras" ayuda="Si el saldo va en letras, el cuadro se arma solo con las fechas de vencimiento.">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.letras != null}
                onChange={(e) => setC((v) => ({ ...v, letras: e.target.checked ? { cantidad: base.letrasCantidad || 3, cadaDias: 30, giro: hoy, interes: 0 } : null }))}
              />
              El saldo va en letras
            </label>
            {c.letras && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Campo label="Cuántas">
                  <Input type="number" min={1} max={36} className="h-8 w-20" value={c.letras.cantidad} onChange={(e) => setC((v) => ({ ...v, letras: v.letras && { ...v.letras, cantidad: Number(e.target.value) } }))} />
                </Campo>
                <Campo label="Cada (días)">
                  <Input type="number" min={1} className="h-8 w-20" value={c.letras.cadaDias} onChange={(e) => setC((v) => ({ ...v, letras: v.letras && { ...v.letras, cadaDias: Number(e.target.value) } }))} />
                </Campo>
                <Campo label="Fecha de giro">
                  <Input type="date" className="h-8 w-36" value={c.letras.giro} onChange={(e) => setC((v) => ({ ...v, letras: v.letras && { ...v.letras, giro: e.target.value } }))} />
                </Campo>
                <Campo label={`Intereses (${simbolo}, total)`}>
                  <Input type="number" step="0.01" min={0} className="h-8 w-28" value={c.letras.interes} onChange={(e) => setC((v) => ({ ...v, letras: v.letras && { ...v.letras, interes: Number(e.target.value) } }))} />
                </Campo>
              </div>
            )}
          </Seccion>

          <Seccion titulo="Recuadro y notas al pie" editado={Boolean(aj.formaPago || aj.cotizacion || aj.ordenCompra || aj.rotulo)}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Campo label="Recuadro de la operación (vacío = lo decide el CRM)" className="sm:col-span-2">
                <Input list="rotulos-liquidacion" value={aj.rotulo ?? ""} onChange={(e) => setAj({ rotulo: e.target.value })} className="h-8 uppercase" placeholder={l.rotulo} />
                <datalist id="rotulos-liquidacion">
                  {["OPERACIÓN CANCELADA", "OPERACIÓN PENDIENTE DE PAGO", "OPERACIÓN CON PAGO A CUENTA", "OPERACIÓN CANCELADA · PENDIENTE COBRO DE DETRACCIÓN"].map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </Campo>
              <Campo label="Forma de pago" className="sm:col-span-2">
                <Input value={aj.formaPago ?? base.formaPago ?? ""} onChange={(e) => setAj({ formaPago: e.target.value })} className="h-8 uppercase" />
              </Campo>
              <Campo label="Cotización">
                <Input value={aj.cotizacion ?? base.cotizacion ?? ""} onChange={(e) => setAj({ cotizacion: e.target.value })} className="h-8" />
              </Campo>
              <Campo label="Orden de compra (vacío = NA)">
                <Input value={aj.ordenCompra ?? base.ordenCompra ?? ""} onChange={(e) => setAj({ ordenCompra: e.target.value })} className="h-8" />
              </Campo>
              <Campo label="Guía (vacío = PDTE)">
                <Input value={c.guia} onChange={(e) => setC((v) => ({ ...v, guia: e.target.value }))} className="h-8 uppercase" />
              </Campo>
              <Campo label="Nota a la izquierda (ej.: VALIDAR SI EMITE HES)">
                <Input value={c.nota} onChange={(e) => setC((v) => ({ ...v, nota: e.target.value }))} className="h-8 uppercase" />
              </Campo>
            </div>
          </Seccion>
        </div>

        {/* ── DERECHA: la hoja, en vivo ─────────────────────────────────── */}
        <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          <div className={cn("rounded-md border px-3 py-2 text-xs", l.estado === "cancelado" ? "border-[#1E7F4F]/40 bg-[#1E7F4F]/5" : "border-amber-300 bg-amber-50")}>
            <p className="font-bold text-foreground">{l.rotulo}</p>
            <p className="text-muted-foreground">
              Total {m(l.base.total)} · saldo <b className="text-foreground">{m(l.saldo)}</b>
              {l.comisionPendiente > 0 && ` · incluye ${m(l.comisionPendiente)} de comisión: se avisa al comercial para que la cobre`}
              {l.facturaVigente ? ` · factura ${l.facturaVigente}` : " · factura pendiente: se avisa a Contabilidad para que facture"}
            </p>
          </div>
          <div className="max-h-[calc(100vh-9rem)] overflow-auto rounded-lg bg-secondary/60 p-3">
            <HojaLiquidacion l={l} className="mx-auto max-w-[720px]" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Los renglones del CRM, listos para editar: las series sueltas pasan al último. */
function copiaEditable(b: BaseLiquidacion): RenglonLiquidacion[] {
  const copia = b.renglones.map((r) => ({ ...r, series: [...r.series] }));
  const sueltas = b.series.map((s) => s.replace(/^.*SERIE:\s*/i, "").trim()).filter(Boolean);
  if (sueltas.length && copia.length) copia[copia.length - 1].series.push(...sueltas);
  return copia;
}

function Seccion({ titulo, ayuda, editado, accion, children }: { titulo: string; ayuda?: string; editado?: boolean; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {titulo}
            {editado && <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-bold uppercase text-amber-900">ajustado</span>}
          </h2>
          {ayuda && <p className="text-[11px] text-muted-foreground">{ayuda}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Campo({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn("grid gap-1 text-[11px] text-muted-foreground", className)}>
      {label}
      {children}
    </label>
  );
}
