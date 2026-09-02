"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { aprobarPedido } from "@/lib/acciones/postventa";
import { Button } from "@/components/ui/button";

/**
 * El acuse de recibo, desde la bandeja.
 *
 * Carlos lo pidió con nombre propio: «yo pongo como postventa aprobado y a
 * Central le sale ya está aprobado, ya está en ejecución». Es un solo clic a
 * propósito — pedir datos acá sería poner un peaje al único paso cuyo valor es
 * que ocurra rápido.
 */
export function AprobarPedidoBoton({ servicioId }: { servicioId: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  // Optimistic (Santos, 02-09): el botón dice «Aprobado» en el instante del
  // toque y vuelve atrás solo si el servidor lo rechaza.
  const [aprobado, setAprobado] = useState(false);

  if (aprobado) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#1E7F4F]/10 px-2.5 py-1.5 text-xs font-semibold text-[#1E7F4F]">
        <Check className="size-4" /> Aprobado
      </span>
    );
  }

  return (
    <Button
      size="sm"
      disabled={pendiente}
      onClick={() =>
        startTransition(async () => {
          setAprobado(true);
          const r = await aprobarPedido(servicioId);
          if (r.error) {
            setAprobado(false);
            toast.error(r.error, { duration: 8000 });
            return;
          }
          toast.success("Pedido aprobado. Central ya lo ve en ejecución.");
          router.refresh();
        })
      }
    >
      {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      Aprobar
    </Button>
  );
}
