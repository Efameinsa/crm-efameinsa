"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpToLine, Loader2 } from "lucide-react";
import { elevarInformeAPostventa } from "@/lib/acciones/almacen";

/** El check con el que el almacén sube un informe a postventa (0252). */
export function SubirAPostventaBoton({ informeId }: { informeId: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        startTransition(async () => {
          const r = await elevarInformeAPostventa(informeId);
          if (r.error) toast.error(r.error);
          else {
            toast.success(`Subido a postventa (${r.avisados ?? 0} avisados)`);
            router.refresh();
          }
        })
      }
      className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
    >
      {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUpToLine className="size-3.5" />} Subir a postventa
    </button>
  );
}
