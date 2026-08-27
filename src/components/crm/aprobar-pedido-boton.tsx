"use client";

import { useTransition } from "react";
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

  return (
    <Button
      size="sm"
      disabled={pendiente}
      onClick={() =>
        startTransition(async () => {
          const r = await aprobarPedido(servicioId);
          if (r.error) {
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
