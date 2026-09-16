"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Package, Wrench } from "lucide-react";
import { definirTipoPedido } from "@/lib/acciones/postventa";
import { ETIQUETA_TIPO_PEDIDO, type TipoPedido } from "@/lib/postventa";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Qué se vendió, y por eso qué circuito sigue el pedido (Carlos, 15-09; 0239).
 *
 * «Debería seleccionarse que es venta de repuesto o venta de equipo… repuesto
 * con entrega en planta o entrega en agencia, con instalación o sin
 * instalación. Check, check y me despliega todo esto». La primera lectura
 * sale del informe de cierre; acá postventa la confirma o la corrige, y los
 * pasos de abajo cambian al toque.
 */
export function TipoPedidoSelector({
  servicioId,
  tipo,
  entregaEn,
  conInstalacion,
  cerrado,
}: {
  servicioId: string;
  tipo: TipoPedido;
  entregaEn: "planta" | "agencia" | "cliente" | null;
  conInstalacion: boolean | null;
  cerrado: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [t, setT] = useState<TipoPedido>(tipo);
  const [e, setE] = useState<"planta" | "agencia" | "cliente" | null>(entregaEn);
  const [i, setI] = useState<boolean | null>(conInstalacion);

  const resumen = [
    ETIQUETA_TIPO_PEDIDO[tipo],
    tipo === "repuesto" && entregaEn ? { planta: "recoge en planta", agencia: "por agencia", cliente: "entrega en el cliente" }[entregaEn] : null,
    tipo === "repuesto" && conInstalacion != null ? (conInstalacion ? "con instalación" : "sin instalación") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function guardar() {
    startTransition(async () => {
      const r = await definirTipoPedido(servicioId, { tipo: t, entregaEn: e, conInstalacion: i });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success("Circuito del pedido actualizado");
      setEditando(false);
      router.refresh();
    });
  }

  if (!editando) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Qué se vendió</span>
        <span className="inline-flex items-center gap-1.5 font-medium">
          {tipo === "equipo" || tipo === "repuesto" ? <Package className="size-3.5 text-muted-foreground" /> : <Wrench className="size-3.5 text-muted-foreground" />}
          {resumen}
        </span>
        {tipo === "repuesto" && (entregaEn == null || conInstalacion == null) && (
          <span className="text-xs text-amber-700">Falta decir cómo se entrega y si lleva instalación</span>
        )}
        {!cerrado && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEditando(true)}>
            Cambiar
          </Button>
        )}
      </div>
    );
  }

  const chip = (activo: boolean) =>
    cn(
      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
      activo ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-accent",
    );

  return (
    <div className="space-y-2.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Qué se vendió</p>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(ETIQUETA_TIPO_PEDIDO) as TipoPedido[]).map((k) => (
          <button key={k} type="button" className={chip(t === k)} onClick={() => setT(k)}>
            {ETIQUETA_TIPO_PEDIDO[k]}
          </button>
        ))}
      </div>
      {t === "repuesto" && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Entrega:</span>
            {(["planta", "agencia", "cliente"] as const).map((k) => (
              <button key={k} type="button" className={chip(e === k)} onClick={() => setE(k)}>
                {{ planta: "Recoge en planta", agencia: "Por agencia", cliente: "En el cliente" }[k]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Instalación:</span>
            <button type="button" className={chip(i === true)} onClick={() => setI(true)}>
              Con instalación (va el técnico)
            </button>
            <button type="button" className={chip(i === false)} onClick={() => setI(false)}>
              Sin instalación
            </button>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {t === "equipo" && "Preparación (pago, aprobación, prueba y plano) → despacho → puesta en marcha y cierre."}
        {t === "repuesto" && (e === "planta" ? "Pago y repuesto listo → se entrega en planta → " : "Pago y repuesto listo → dirección, apertura y despacho → ") + (i ? "instalación por el técnico y cierre." : "cierre.")}
        {(t === "mantenimiento" || t === "revision") && "Pago → dónde y con quién, apertura de servicio, programación del técnico → ejecución con informe y cierre."}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={guardar} disabled={pendiente || (t === "repuesto" && (e == null || i == null))}>
          {pendiente && <Loader2 className="size-4 animate-spin" />}
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
