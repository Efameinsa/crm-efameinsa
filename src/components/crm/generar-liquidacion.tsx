"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Eye, FileCog, Loader2 } from "lucide-react";
import { validarLiquidacion, vistaPreviaLiquidacion } from "@/lib/acciones/liquidacion-automatica";
import {
  calcularLiquidacion,
  complementosIniciales,
  NOMBRE_RETENIDO,
  PCT_RETENIDO,
  type BaseLiquidacion,
  type Complementos,
  type TipoRetenido,
} from "@/lib/liquidacion-automatica";
import { redondear2 } from "@/lib/igv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * GENERAR LA LIQUIDACIÓN (0534; reunión 17-10, gerencia con Jhon).
 *
 * «Va a extraer todos los datos y lo único que tú tienes que hacer ahí, le
 * pones el número de operación». Lo que el CRM ya sabe viene puesto (cliente,
 * renglones, series, abonos con su operación y banco, comisiones, facturas);
 * acá solo se completa lo que falta, se mira la vista previa y se valida.
 * Cada pago o factura nueva = otra liquidación con el número siguiente.
 */
export function GenerarLiquidacion({ base, hoy }: { base: BaseLiquidacion; hoy: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [c, setC] = useState<Complementos>(() => complementosIniciales(base));
  const [pendiente, startTransition] = useTransition();
  const [mirando, startMirar] = useTransition();
  const [problema, setProblema] = useState<string | null>(null);

  const l = useMemo(() => calcularLiquidacion(base, c, hoy), [base, c, hoy]);
  const simbolo = base.moneda === "PEN" ? "S/" : "US$";
  const m = (n: number) => `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const abonos = [...base.abonos].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.createdAt.localeCompare(y.createdAt));

  function retenido(tipo: TipoRetenido | null) {
    setC((v) => ({
      ...v,
      retenido: tipo
        ? { tipo, pct: PCT_RETENIDO[tipo], monto: redondear2((base.total * PCT_RETENIDO[tipo]) / 100), cobrado: v.retenido?.cobrado ?? false }
        : null,
    }));
  }

  function verPrevia() {
    setProblema(null);
    startMirar(async () => {
      const r = await vistaPreviaLiquidacion(base.servicioId, c);
      if (r.error || !r.pdf) return void setProblema(r.error ?? "No se pudo armar la vista previa.");
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
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        // Al abrir, lo último del pedido (un abono o una factura que acaba de entrar).
        if (v) setC(complementosIniciales(base));
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <FileCog className="size-3.5" />
            Generar liquidación {base.yaHay + 1}
          </Button>
        }
      />
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Liquidación N.º {base.yaHay + 1} · {base.pedido}</DialogTitle>
          <DialogDescription>
            El CRM ya puso el cliente, los renglones, las series y los abonos confirmados. Complete solo lo que falta, mire la vista previa y valide.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 text-sm">
          <div className="rounded-md bg-secondary/50 p-3 text-xs">
            <p className="font-semibold text-foreground">{base.cliente}{base.clienteDoc ? ` · ${base.clienteDoc}` : ""}</p>
            <p className="text-muted-foreground">
              {base.renglones.length} renglón{base.renglones.length === 1 ? "" : "es"} · total {m(base.total)}
              {base.series.length ? ` · ${base.series.length} serie${base.series.length === 1 ? "" : "s"}` : " · sin series anotadas"}
              {base.cotizacion ? ` · cotización ${base.cotizacion}` : ""}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Abonos confirmados y su factura</Label>
            {abonos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Todavía no hay abonos confirmados{base.pagadoSinDetalle > 0 ? ` (hay ${m(base.pagadoSinDetalle)} de antes del CRM)` : ""}: la liquidación sale «pendiente de pago» para que el cliente pague con su factura.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {abonos.map((a, i) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs">
                    <span>
                      <b>Abono {i + 1}</b> · {m(a.neto + a.comision)} · {a.fecha.split("-").reverse().join("/")} · {a.medio} · op. {a.operacion}
                      {a.comision > 0 && <span className="text-amber-800"> · comisión {m(a.comision)}</span>}
                    </span>
                    <select
                      value={c.facturaDeAbono[a.id] ?? ""}
                      onChange={(e) => setC((v) => ({ ...v, facturaDeAbono: { ...v.facturaDeAbono, [a.id]: e.target.value } }))}
                      className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
                      aria-label={`Factura del abono ${i + 1}`}
                    >
                      <option value="">Pendiente de factura</option>
                      {base.facturas.map((f) => (
                        <option key={f.numero} value={f.numero}>FT {f.numero}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>¿Afecta a detracción o retención?</Label>
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
                  {t ? `${NOMBRE_RETENIDO[t]} (${PCT_RETENIDO[t]} %)` : "No"}
                </button>
              ))}
            </div>
            {c.retenido && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs">
                  %
                  <Input
                    type="number"
                    step="0.5"
                    className="h-8 w-20"
                    value={c.retenido.pct}
                    onChange={(e) => {
                      const pct = Number(e.target.value);
                      setC((v) => ({ ...v, retenido: v.retenido && { ...v.retenido, pct, monto: redondear2((base.total * pct) / 100) } }));
                    }}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  Monto ({simbolo})
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-32"
                    value={c.retenido.monto}
                    onChange={(e) => setC((v) => ({ ...v, retenido: v.retenido && { ...v.retenido, monto: Number(e.target.value) } }))}
                  />
                </label>
                <label className="inline-flex items-center gap-1.5 pb-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={c.retenido.cobrado}
                    onChange={(e) => setC((v) => ({ ...v, retenido: v.retenido && { ...v.retenido, cobrado: e.target.checked } }))}
                  />
                  Ya se cobró
                </label>
                <p className="basis-full text-[11px] text-muted-foreground">Cuenta como pagado: postventa puede seguir con el despacho aunque falte cobrarla.</p>
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={c.letras != null}
                onChange={(e) =>
                  setC((v) => ({ ...v, letras: e.target.checked ? { cantidad: base.letrasCantidad || 3, cadaDias: 30, giro: hoy, interes: 0 } : null }))
                }
              />
              El saldo va en letras
            </label>
            {c.letras && (
              <div className="flex flex-wrap items-end gap-2 text-xs">
                <label className="grid gap-1">
                  Letras
                  <Input type="number" min={1} max={36} className="h-8 w-20" value={c.letras.cantidad} onChange={(e) => setC((v) => ({ ...v, letras: v.letras && { ...v.letras, cantidad: Number(e.target.value) } }))} />
                </label>
                <label className="grid gap-1">
                  Cada (días)
                  <Input type="number" min={1} className="h-8 w-20" value={c.letras.cadaDias} onChange={(e) => setC((v) => ({ ...v, letras: v.letras && { ...v.letras, cadaDias: Number(e.target.value) } }))} />
                </label>
                <label className="grid gap-1">
                  Giro
                  <Input type="date" className="h-8 w-36" value={c.letras.giro} onChange={(e) => setC((v) => ({ ...v, letras: v.letras && { ...v.letras, giro: e.target.value } }))} />
                </label>
                <label className="grid gap-1">
                  Intereses ({simbolo}, total)
                  <Input type="number" step="0.01" min={0} className="h-8 w-28" value={c.letras.interes} onChange={(e) => setC((v) => ({ ...v, letras: v.letras && { ...v.letras, interes: Number(e.target.value) } }))} />
                </label>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="liq-guia">Guía de remisión</Label>
              <Input id="liq-guia" value={c.guia} onChange={(e) => setC((v) => ({ ...v, guia: e.target.value }))} placeholder="Vacío = PDTE" className="uppercase" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="liq-nota">Nota (opcional)</Label>
              <Textarea id="liq-nota" rows={1} value={c.nota} onChange={(e) => setC((v) => ({ ...v, nota: e.target.value }))} placeholder="Ej.: validar si emite HES" />
            </div>
          </div>

          <div className={cn("rounded-md border p-3 text-xs", l.estado === "cancelado" ? "border-[#1E7F4F]/40 bg-[#1E7F4F]/5" : "border-amber-300 bg-amber-50")}>
            <p className="font-bold text-foreground">{l.rotulo}</p>
            <p className="text-muted-foreground">
              Total {m(base.total)} · saldo <b className="text-foreground">{m(l.saldo)}</b>
              {l.comisionPendiente > 0 && ` · incluye ${m(l.comisionPendiente)} de comisión: se avisa al comercial para que la cobre`}
              {l.facturaVigente ? ` · factura ${l.facturaVigente}` : " · con abono pendiente de factura: se avisa a Contabilidad"}
            </p>
          </div>

          {problema && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">{problema}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={verPrevia} disabled={mirando || pendiente}>
              {mirando ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
              Vista previa
            </Button>
            <Button onClick={validar} disabled={pendiente || mirando}>
              {pendiente ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {pendiente ? "Validando…" : "Validar y enviar a Central"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
