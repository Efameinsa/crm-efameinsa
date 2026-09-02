"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Undo2 } from "lucide-react";
import { trabajarOportunidadHistorica } from "@/lib/acciones/oportunidades";
import { cn } from "@/lib/utils";

/**
 * «Retomar»: la puerta de vuelta desde el archivo (se llamó «Trabajar esta
 * oportunidad» hasta el 02-09; Santos pidió una sola palabra, la misma en la
 * ficha, en Histórico y en la base de Mi día).
 *
 * El 31-08 (migración 0130) 20.443 oportunidades que venían de los Excel y que
 * nadie había tocado dentro del CRM pasaron a la etapa `historico`: dejaron de
 * llenar el Kanban, «Mi día», la agenda y los reportes de trabajo que nunca se
 * pidió. NO se borró ninguna — siguen en la cartera de su comercial, con todas
 * sus actividades, en la ficha del cliente y en la pestaña «Histórico» de Mis
 * oportunidades.
 *
 * Este botón es la mitad que faltaba: el comercial encuentra a un cliente
 * viejo, decide retomarlo, y con un clic la oportunidad vuelve a `seguimiento`
 * con la próxima acción para hoy. Sin pedir código de supervisor: es su propia
 * cartera. Queda la nota de quién la reactivó y cuándo, para que mañana nadie
 * se pregunte de dónde salió esa fila en el reporte.
 *
 * Va dentro de filas que son enlaces (la tabla y la ficha del cliente), así
 * que el clic se detiene acá y no navega.
 */
export function TrabajarHistoricaBoton({
  oportunidadId,
  compacto = false,
}: {
  oportunidadId: string;
  compacto?: boolean;
}) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();

  function trabajar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    iniciar(async () => {
      const { error } = await trabajarOportunidadHistorica(oportunidadId);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Retomada: vuelve a su lista de hoy", {
        description: "Quedó en seguimiento, con la próxima acción para hoy. Ya aparece en Mi día y en la agenda.",
      });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={trabajar}
      disabled={enviando}
      title="La saca de la base del Excel: vuelve a seguimiento con la próxima acción para hoy, y queda anotado quién la retomó"
      className={cn(
        "inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-wait disabled:opacity-60",
        compacto ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
      )}
    >
      {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
      Retomar
    </button>
  );
}
