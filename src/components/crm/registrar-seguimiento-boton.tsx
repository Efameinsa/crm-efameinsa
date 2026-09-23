"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { abrirSeguimiento } from "@/lib/acciones/casos";
import { abrirSeguimientoComercial } from "@/lib/acciones/oportunidades";

/**
 * «Registrar seguimiento» desde la ficha del cliente, para postventa (0238).
 *
 * Carlos, 15-09, en la ficha de Lavipronto: «lo concreto es registrar una
 * gestión para poder hacer una visita… esto mañana ya está corregido». No
 * abre un caso ni manda nada a Central: pide el expediente del área con ese
 * cliente —el abierto, o uno de seguimiento— y lleva al registro de gestión
 * de siempre, con el cuadro ya abierto.
 *
 * `comercial` (23-09, 0281): la misma acción para el comercial que sigue SU
 * cartera. La llamada va a su expediente comercial —el abierto, el histórico
 * retomado o uno nuevo—, nunca a uno de postventa: si no, no le cuenta en la
 * meta (Ariana, del 17 al 23-09, 137 llamadas que no le sumaban).
 */
export function RegistrarSeguimientoBoton({
  cuentaId,
  compacto = false,
  comercial = false,
}: {
  cuentaId: string;
  compacto?: boolean;
  comercial?: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      // Detiene el clic: en Mi cartera va dentro de una fila que abre la ficha.
      onClick={(e) => {
        e.stopPropagation();
        startTransition(async () => {
          const r = comercial ? await abrirSeguimientoComercial(cuentaId) : await abrirSeguimiento(cuentaId);
          if (r.error || !r.oportunidadId) {
            toast.error(r.error ?? "No se pudo abrir el expediente", { duration: 8000 });
            return;
          }
          router.push(`/comercial/oportunidades/${r.oportunidadId}?gestion=1`);
        });
      }}
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
