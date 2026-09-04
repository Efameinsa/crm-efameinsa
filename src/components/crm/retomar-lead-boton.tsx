"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { retomarLead } from "@/lib/acciones/avisos";

/**
 * Un rechazado no es un caso cerrado para siempre.
 *
 * El ing. Carlos, 04-09: «está bien que se rechace, pero que se vea con los
 * rechazados (…) cualquier eventualidad la podemos retomar. Ya llegó la cola,
 * hoy día lo vamos a atender: ahora sí, redirecciónalo a Finanzas o al
 * comercial que lo está atendiendo. Que te permita verlo y retomarlo».
 *
 * Retomar lo devuelve a la bandeja tal como llegó; desde ahí Central lo reparte
 * con las salidas de siempre.
 */
export function RetomarLeadBoton({ leadId, codigo }: { leadId: string; codigo: string }) {
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={enviando}
      onClick={() =>
        empezar(async () => {
          const r = await retomarLead(leadId);
          if (r.error) {
            toast.error(r.error);
            return;
          }
          toast.success(`${codigo} volvió a la bandeja para repartirlo.`);
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground hover:bg-accent disabled:opacity-50"
    >
      <Undo2 className="size-3" /> {enviando ? "Retomando…" : "Retomar"}
    </button>
  );
}
