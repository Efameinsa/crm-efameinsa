"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Wrench } from "lucide-react";
import { ofrecerMantenimiento } from "@/lib/acciones/parque";

/** Abre (o retoma) la oportunidad de mantenimiento del cliente y lleva a su ficha. */
export function OfrecerMantenimientoBoton({ cuentaId, compacto = false }: { cuentaId: string; compacto?: boolean }) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={enviando}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        iniciar(async () => {
          const r = await ofrecerMantenimiento(cuentaId);
          if (r.error || !r.oportunidadId) {
            toast.error(r.error ?? "No se pudo abrir la oportunidad");
            return;
          }
          if (r.yaEstaba) toast.info(`Ya está en gestión por ${r.quien}`, { description: "Se abre esa misma oportunidad: la gestión se ve completa ahí." });
          else toast.success("Oportunidad de mantenimiento abierta", { description: "Quedó para hoy en Mi día. Registre la llamada desde la ficha." });
          router.push(`/comercial/oportunidades/${r.oportunidadId}`);
        });
      }}
      className={
        compacto
          ? "inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
          : "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      }
    >
      {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Wrench className="size-3.5" />}
      Ofrecer mantenimiento
    </button>
  );
}
