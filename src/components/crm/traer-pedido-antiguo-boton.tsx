"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PackagePlus } from "lucide-react";
import { traerPedidoAntiguo } from "@/lib/acciones/postventa";
import { ETIQUETA_TIPO_PEDIDO, type TipoPedido } from "@/lib/postventa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * «Traer a preparación» un pedido anterior al circuito (Carlos, 15-09; 0239).
 *
 * Choquehuanca vendido el 01-08, JMZ con el variador en importación, Suyón,
 * las 20 máquinas de MG: ventas sin cierre en el CRM que no aparecen en
 * Pedidos, y sin pedido «me quedo inmóvil» (Rubí). Desde la ficha del
 * cliente se abre el pedido con lo que se sabe, ya aprobado, y sigue la
 * secuencia de siempre: preparación, despacho, puesta en marcha.
 */
export function TraerPedidoAntiguoBoton({ cuentaId, compacto = false }: { cuentaId: string; compacto?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [tipo, setTipo] = useState<TipoPedido>("equipo");
  const [entregaEn, setEntregaEn] = useState<"planta" | "agencia" | "cliente" | null>(null);
  const [conInstalacion, setConInstalacion] = useState<boolean | null>(null);
  const [f, setF] = useState({ equipo: "", monto: "", moneda: "USD" as "USD" | "PEN", fechaVenta: "", referencia: "", nota: "" });
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value })) });
  const chip = (activo: boolean) =>
    cn("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", activo ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-accent");

  function enviar() {
    startTransition(async () => {
      const r = await traerPedidoAntiguo({
        cuentaId,
        tipo,
        equipo: f.equipo,
        monto: f.monto.trim() ? Number(f.monto) : null,
        moneda: f.moneda,
        fechaVenta: f.fechaVenta || null,
        referencia: f.referencia,
        nota: f.nota,
        entregaEn: tipo === "repuesto" || tipo === "accesorio" ? entregaEn : null,
        conInstalacion: tipo === "repuesto" ? conInstalacion : null,
      });
      if (r.error || !r.id) {
        toast.error(r.error ?? "No se pudo abrir el pedido", { duration: 8000 });
        return;
      }
      toast.success("El pedido ya está en preparación");
      setAbierto(false);
      router.push(`/postventa/pedidos/${r.id}`);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={
              compacto
                ? "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                : "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            }
            title="Una venta anterior al circuito que hay que despachar o atender: entra a Pedidos ya aprobada"
          >
            <PackagePlus className="size-3.5" />
            Traer a preparación
          </button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Traer un pedido anterior a preparación</DialogTitle>
          <DialogDescription>
            Para ventas que se cerraron antes del circuito y no tienen cierre en el CRM. El pedido nace ya ejecutado,
            liquidado y aprobado —eso pasó antes— y sigue la secuencia de siempre. Queda escrito quién lo trajo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Qué se vendió</Label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(ETIQUETA_TIPO_PEDIDO) as TipoPedido[]).map((k) => (
                <button key={k} type="button" className={chip(tipo === k)} onClick={() => setTipo(k)}>
                  {ETIQUETA_TIPO_PEDIDO[k]}
                </button>
              ))}
            </div>
          </div>
          {tipo === "accesorio" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Entrega:</span>
              {(["planta", "agencia", "cliente"] as const).map((k) => (
                <button key={k} type="button" className={chip(entregaEn === k)} onClick={() => setEntregaEn(k)}>
                  {{ planta: "Recoge en planta", agencia: "Por agencia", cliente: "En el cliente" }[k]}
                </button>
              ))}
            </div>
          )}
          {tipo === "repuesto" && (
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-muted-foreground">Entrega:</span>
                {(["planta", "agencia", "cliente"] as const).map((k) => (
                  <button key={k} type="button" className={chip(entregaEn === k)} onClick={() => setEntregaEn(k)}>
                    {{ planta: "Recoge en planta", agencia: "Por agencia", cliente: "En el cliente" }[k]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-muted-foreground">Instalación:</span>
                <button type="button" className={chip(conInstalacion === true)} onClick={() => setConInstalacion(true)}>
                  Con instalación
                </button>
                <button type="button" className={chip(conInstalacion === false)} onClick={() => setConInstalacion(false)}>
                  Sin instalación
                </button>
              </div>
            </div>
          )}
          <div className="grid gap-1">
            <Label className="text-xs">
              Equipo, repuesto o servicio <span className="text-destructive">*</span>
            </Label>
            <Textarea rows={2} {...campo("equipo")} placeholder="ej. LAVADORA LG TITAN 17 KG + SECADORA TITAN LIGHT 15 KG" />
          </div>
          <div className="grid grid-cols-[1fr_6rem_1fr] gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">Monto total</Label>
              <Input type="number" step="0.01" min="0" {...campo("monto")} placeholder="sin IGV" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Moneda</Label>
              <select
                value={f.moneda}
                onChange={(e) => setF((x) => ({ ...x, moneda: e.target.value as "USD" | "PEN" }))}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="USD">USD</option>
                <option value="PEN">PEN</option>
              </select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Fecha de la venta</Label>
              <Input type="date" {...campo("fechaVenta")} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Documento de origen (cierre, cotización o pedido del ERP)</Label>
            <Input {...campo("referencia")} placeholder="ej. cierre 015-2026 Open · cotización 609-26" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Nota</Label>
            <Input {...campo("nota")} placeholder="ej. pagó el saldo el 14-09; pide despacho por agencia" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={pendiente || f.equipo.trim().length < 3 || (tipo === "repuesto" && (entregaEn == null || conInstalacion == null)) || (tipo === "accesorio" && entregaEn == null)}>
            {pendiente && <Loader2 className="size-4 animate-spin" />}
            Abrir el pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
