import { CornerDownLeft, PartyPopper } from "lucide-react";
import { ReenviarCierreBoton } from "@/components/crm/devolver-cierre-boton";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import type { createClient } from "@/lib/supabase/server";

export interface DevolucionAbierta {
  motivo: string;
  devueltoAt: string;
  devueltoPor: string | null;
}

/** La devolución de Central que sigue sin responder, si la hay (0178). */
export async function devolucionAbierta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  informeId: string,
): Promise<DevolucionAbierta | null> {
  const { data } = await supabase
    .from("devoluciones_cierre")
    .select("motivo, devuelto_at, devuelto_por")
    .eq("informe_id", informeId)
    .is("resuelto_at", null)
    .order("devuelto_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { data: quien } = data.devuelto_por
    ? await supabase.from("perfiles").select("nombre").eq("id", data.devuelto_por).maybeSingle()
    : { data: null };
  return { motivo: data.motivo as string, devueltoAt: data.devuelto_at as string, devueltoPor: (quien?.nombre as string | undefined) ?? null };
}

/**
 * «Central le devolvió este cierre» DENTRO del cierre (Santos, 30-09).
 *
 * Gabriela corrigió el 046 —subió la cotización con el código de Lesly— y
 * Central seguía sin verlo: la devolución solo se cierra con «Ya lo corregí», y
 * ese botón vivía únicamente en la lista de «Ventas emitidas». Desde el cierre
 * o desde la corrección no había nada que se lo recordara. Ahora el motivo y el
 * botón están donde se trabaja, y al guardar la corrección el aviso cambia a
 * «ahora avísele a Central».
 */
export function AvisoDevolucionCierre({
  devolucion,
  puedeReenviar,
  recienCorregido = false,
  enCorreccion = false,
  informeId,
}: {
  devolucion: DevolucionAbierta;
  puedeReenviar: boolean;
  /** Acaba de guardar la corrección: el paso que falta es avisar. */
  recienCorregido?: boolean;
  /** Se muestra encima del formulario de corrección: sin botón, solo el motivo. */
  enCorreccion?: boolean;
  informeId: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3.5",
        recienCorregido ? "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-500/10" : "border-amber-400/60 bg-amber-50 dark:bg-amber-500/10",
      )}
    >
      <p
        className={cn(
          "flex items-start gap-2 text-sm font-semibold",
          recienCorregido ? "text-emerald-900 dark:text-emerald-300" : "text-amber-900 dark:text-amber-300",
        )}
      >
        {recienCorregido ? <PartyPopper className="mt-0.5 size-4 flex-none" /> : <CornerDownLeft className="mt-0.5 size-4 flex-none" />}
        {recienCorregido
          ? "Corrección guardada. Falta un paso: avísele a Central que ya está."
          : `${devolucion.devueltoPor ?? "Central"} le devolvió este cierre el ${fechaHoraLima(devolucion.devueltoAt)}`}
      </p>
      <p className="mt-1 pl-6 text-sm text-foreground">
        <span className="text-muted-foreground">Motivo: </span>«{devolucion.motivo}»
      </p>
      {enCorreccion ? (
        <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
          Corrija o agregue lo que falta y pulse «Guardar corrección». Después, en el cierre, pulse «Ya lo corregí» para
          que vuelva a la cola de Central.
        </p>
      ) : puedeReenviar ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
          <ReenviarCierreBoton informeId={informeId} />
          <span className="text-xs text-muted-foreground">
            {recienCorregido
              ? "Mientras no lo pulse, Central lo sigue viendo como devuelto."
              : "Corrija lo que haga falta con «Editar» y después pulse aquí: recién ahí Central lo vuelve a ver."}
          </span>
        </div>
      ) : (
        <p className="mt-1.5 pl-6 text-xs text-muted-foreground">Queda devuelto hasta que quien lo emitió diga «Ya lo corregí».</p>
      )}
    </div>
  );
}
