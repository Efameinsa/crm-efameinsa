"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { abrirSeguimiento } from "@/lib/acciones/casos";

/**
 * «Registrar seguimiento» desde la ficha del cliente, para postventa (0238).
 *
 * Carlos, 15-09, en la ficha de Lavipronto: «lo concreto es registrar una
 * gestión para poder hacer una visita… esto mañana ya está corregido». No
 * abre un caso ni manda nada a Central: pide el expediente del área con ese
 * cliente —el abierto, o uno de seguimiento— y lleva al registro de gestión
 * de siempre, con el cuadro ya abierto.
 */
export function RegistrarSeguimientoBoton({ cuentaId, compacto = false }: { cuentaId: string; compacto?: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        startTransition(async () => {
          const r = await abrirSeguimiento(cuentaId);
          if (r.error || !r.oportunidadId) {
            toast.error(r.error ?? "No se pudo abrir el expediente", { duration: 8000 });
            return;
          }
          router.push(`/comercial/oportunidades/${r.oportunidadId}?gestion=1`);
        })
      }
      className={
        compacto
          ? "inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          : "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      }
      title="Anotar una llamada, un WhatsApp o lo que se coordinó, sin abrir un caso nuevo"
    >
      {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquarePlus className="size-3.5" />}
      Registrar seguimiento
    </button>
  );
}
