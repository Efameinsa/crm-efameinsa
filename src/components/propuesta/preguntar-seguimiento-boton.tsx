"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageCircleQuestion } from "lucide-react";
import { preguntarSeguimiento } from "@/lib/acciones/leads";

/**
 * «Preguntarle» en el «Hoy» de Central (0446, buzón Central 12-10): un solo
 * aviso al comercial con la lista de sus derivados quietos. Esos contactos
 * salen de la lista por 7 días.
 */
export function PreguntarSeguimientoBoton({ leadIds, comercial }: { leadIds: string[]; comercial: string }) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();
  const n = leadIds.length;

  function preguntar() {
    startTransition(async () => {
      const r = await preguntarSeguimiento(leadIds);
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(
        `Listo: a ${comercial} le llegó el aviso en su campana con ${n === 1 ? "el contacto" : `los ${r.contactos ?? n} contactos`}. Si en 7 días sigue sin movimiento, vuelve a esta lista.`,
        { duration: 9000 },
      );
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={preguntar}
      disabled={enviando}
      title={`Le llega a ${comercial} un aviso en la campana con ${n === 1 ? "este contacto" : `estos ${n} contactos`}, para que registre su gestión`}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
    >
      <MessageCircleQuestion className="size-3.5" />
      {enviando ? "Enviando…" : `Preguntarle${n > 1 ? ` (${n})` : ""}`}
    </button>
  );
}
