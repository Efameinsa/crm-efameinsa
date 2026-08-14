"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { aprobarCotizacion, rechazarCotizacion } from "@/lib/acciones/cotizaciones";
import { Button } from "@/components/ui/button";

export function AprobarCotizacionBotones({ cotizacionId }: { cotizacionId: string }) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();

  function aprobar() {
    startTransition(async () => {
      const r = await aprobarCotizacion(cotizacionId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Cotización aprobada");
        router.refresh();
      }
    });
  }

  function rechazar() {
    if (!confirm("¿Rechazar esta cotización?")) return;
    startTransition(async () => {
      const r = await rechazarCotizacion(cotizacionId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Cotización rechazada");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="outline" disabled={enviando} onClick={rechazar}>
        Rechazar
      </Button>
      <Button size="sm" disabled={enviando} onClick={aprobar}>
        Aprobar
      </Button>
    </div>
  );
}
