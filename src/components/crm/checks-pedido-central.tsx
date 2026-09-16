"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { liberarPedido } from "@/lib/acciones/postventa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CampoCodigo } from "@/components/crm/campo-codigo";

/**
 * Los dos checks de Central sobre un cierre de venta.
 *
 * Es el disparador de todo el circuito nuevo. Textual del ing. Carlos el 27-08:
 * «cuando le haga check pedido ejecutado, y liquidación… significa que ya le
 * llegue inmediatamente a postventa, y acá me va a aparecer nuevo pedido».
 *
 * El pedido lo sigue generando el ERP: acá solo se anota su número, que es lo
 * que después permite cruzar cuando alguien pregunta por él. La liquidación
 * hoy la marca Central en nombre de Finanzas; cuando Finanzas tenga usuario
 * propio, el botón se le muda sin tocar el resto.
 */
export function ChecksPedidoCentral({
  informeId,
  cliente,
  pedidoEjecutado,
  liquidacion,
  aprobadoPostventa,
  numeroPedido,
}: {
  informeId: string;
  cliente: string;
  pedidoEjecutado: boolean;
  liquidacion: boolean;
  aprobadoPostventa: boolean;
  numeroPedido: string | null;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [numero, setNumero] = useState(numeroPedido ?? "");
  // EJECUTAR SIN LIQUIDACIÓN ES UNA EXCEPCIÓN CON CÓDIGO (Carlos, 15-09; 0237).
  // Tunupa y Gary Group se ejecutaron sin liquidación «para que postventa
  // avance», postventa aprobó antes del segundo check y el botón se perdió.
  // El orden es liquidación → ejecutado; saltárselo pide el código de gerencia
  // u operaciones y deja quién lo autorizó.
  const [pin, setPin] = useState("");
  // Optimistic (Santos, 02-09): el check se pinta al toque y se revierte si
  // el servidor lo rechaza. La lista vuelve a leerse de la base después.
  const [visto, setVisto] = useState<{ pedido: boolean; liquidacion: boolean }>({ pedido: pedidoEjecutado, liquidacion });
  const pedidoEjecutadoVisto = visto.pedido;
  const liquidacionVista = visto.liquidacion;

  function marcar(campo: "pedido" | "liquidacion", numeroPedidoErp?: string) {
    const antes = visto;
    setVisto((v) => ({ ...v, [campo]: true }));
    startTransition(async () => {
      const r = await liberarPedido({
        informeId,
        numeroPedido: numeroPedidoErp ?? null,
        marcarPedido: campo === "pedido",
        marcarLiquidacion: campo === "liquidacion",
        pin: campo === "pedido" && !liquidacionVista ? pin : null,
      });
      if (r.error) {
        setVisto(antes);
        setPin("");
        toast.error(r.error, { duration: 9000 });
        return;
      }
      const quedaCompleto = campo === "pedido" ? liquidacion : pedidoEjecutado;
      toast.success(
        quedaCompleto
          ? `Pedido liberado. Postventa ya lo tiene en su bandeja.`
          : campo === "pedido"
            ? "Pedido marcado como ejecutado. Falta la liquidación."
            : "Liquidación marcada. Falta el pedido ejecutado.",
      );
      setAbierto(false);
      router.refresh();
    });
  }

  if (aprobadoPostventa) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 text-[11px] font-semibold text-[#1E7F4F]">
          <Check className="size-3" /> En ejecución
        </span>
        {/* LA LIQUIDACIÓN NO DESAPARECE (Central, 15-09: Tunupa Lodge y Gary
            Group). Postventa aprobó el pedido antes de que Central marcara
            la liquidación, y con «En ejecución» el botón se iba: quedaban dos
            pedidos sin liquidación registrada y sin forma de ponerla. El
            check sigue disponible hasta que se marque. */}
        {!liquidacionVista && (
          <Chip activo={false} onClick={() => marcar("liquidacion")} disabled={pendiente} etiqueta="Liquidación" />
        )}
      </div>
    );
  }

  if (pedidoEjecutadoVisto && liquidacionVista) {
    return (
      <span className="whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Con postventa
      </span>
    );
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <Chip
          activo={pedidoEjecutadoVisto}
          onClick={() => setAbierto(true)}
          disabled={pendiente}
          etiqueta="Pedido ejecutado"
        />
        <Chip
          activo={liquidacionVista}
          onClick={() => marcar("liquidacion")}
          disabled={pendiente}
          etiqueta="Liquidación"
        />
      </div>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pedido ejecutado en el ERP</DialogTitle>
            <DialogDescription>
              {cliente}. Anote el número con que quedó el pedido en el ERP: es lo que después permite cruzarlo cuando
              alguien pregunte por él. Con este check y el de liquidación, el pedido cae solo en la bandeja de
              postventa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="numero-pedido" className="text-xs">
              N.º de pedido del ERP <span className="text-destructive">*</span>
            </Label>
            <Input
              id="numero-pedido"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="ej. PED-000123"
              required
            />
          </div>
          {!liquidacionVista && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="text-xs font-semibold text-amber-800">La liquidación todavía no está marcada</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                El orden es liquidación y después pedido ejecutado. Si hay que ejecutarlo antes —para que postventa
                pruebe y embale mientras Finanzas termina—, pida el código de gerencia u operaciones: queda registrado
                quién lo autorizó.
              </p>
              <div className="mt-2">
                <CampoCodigo valor={pin} onChange={setPin} tono="amber" id="pin-ejecutar" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => marcar("pedido", numero)}
              disabled={pendiente || !numero.trim() || (!liquidacionVista && pin.replace(/\D/g, "").length < 4)}
              title={!numero.trim() ? "Anote el número del pedido en el ERP" : !liquidacionVista && pin.replace(/\D/g, "").length < 4 ? "Falta el código de autorización" : undefined}
            >
              {pendiente && <Loader2 className="size-4 animate-spin" />}
              {liquidacionVista ? "Marcar ejecutado" : "Ejecutar con código"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Chip({
  activo,
  etiqueta,
  onClick,
  disabled,
}: {
  activo: boolean;
  etiqueta: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={activo ? undefined : onClick}
      disabled={disabled || activo}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
        activo
          ? "cursor-default border-[#1E7F4F]/30 bg-[#1E7F4F]/10 text-[#1E7F4F]"
          : "border-border text-muted-foreground hover:border-primary hover:text-primary",
      )}
    >
      {activo ? <Check className="size-3" /> : <span className="text-[13px] leading-none">○</span>}
      {etiqueta}
    </button>
  );
}
