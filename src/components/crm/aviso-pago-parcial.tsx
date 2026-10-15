import { AlertTriangle } from "lucide-react";
import { pagoParcialSinCubrir, type ServicioPostventa } from "@/lib/postventa";

/**
 * EL ANUNCIO DEL PAGO PARCIAL (reunión 15-10, 12:51; Carlos, Ariana, Santos).
 *
 * Caso Wong Lu Vega: el cliente pagó el 20 % y el pedido mostraba el check
 * verde de «Finanzas confirmó». Postventa, revisando todo lo pendiente por
 * despachar, lo leyó como pagado al 100 % y quiso despachar; recién el
 * comercial dijo que no. Carlos: «no debe salir como verde… que salga un
 * anuncio… algo que uno lee y diga no». Y no era un solo caso: ese día había
 * seis pedidos abiertos en la misma situación.
 *
 * Va arriba de «Qué sigue», en ámbar, en las pantallas del pedido que abren
 * postventa y el almacén. Se apaga solo cuando Finanzas confirma lo que
 * falta, cuando el adelanto acordado queda cubierto o cuando gerencia u
 * operaciones autorizan la salida con su código.
 */
export function AvisoPagoParcial({ servicio }: { servicio: ServicioPostventa }) {
  const parcial = pagoParcialSinCubrir(servicio);
  if (!parcial) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-sm dark:border-amber-500/60 dark:bg-amber-500/10"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">
        <AlertTriangle className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Pago parcial · no se despacha todavía</p>
        <p className="text-lg font-bold text-foreground">Finanzas confirmó un adelanto, no el pago completo</p>
        <p className="mt-0.5 text-sm text-amber-900 dark:text-amber-200">{parcial.largo}</p>
      </div>
    </div>
  );
}
