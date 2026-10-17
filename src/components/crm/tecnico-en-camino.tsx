"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Car, Check, Loader2, MapPinCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { marcarTecnico } from "@/lib/acciones/portal";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * «EL TÉCNICO SALIÓ HACIA EL CLIENTE» Y «EL TÉCNICO LLEGÓ AL LOCAL» (0527).
 *
 * Dos marcas con hora y nombre, como los demás pasos del pedido: el check se
 * pinta al tocar y, si el servidor dice que no, vuelve atrás y avisa. La
 * primera dispara el aviso al cliente «El técnico va en camino» (motor de
 * avisos); por eso se puede deshacer al toque si se marcó por error.
 */

interface Marca {
  at: string | null;
  quien: string | null;
}

export function TecnicoEnCamino({
  donde,
  id,
  salio,
  llego,
  puede,
  cerrado = false,
}: {
  donde: "pedido" | "caso";
  id: string;
  salio: Marca;
  llego: Marca;
  /** Postventa, almacén, operaciones o gerencia. Los demás solo miran. */
  puede: boolean;
  cerrado?: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [visto, parchar] = useOptimistic({ salio, llego }, (actual, parche: Partial<{ salio: Marca; llego: Marca }>) => ({ ...actual, ...parche }));

  function correr(paso: "salio" | "llego", deshacer: boolean) {
    startTransition(async () => {
      parchar({ [paso]: deshacer ? { at: null, quien: null } : { at: new Date().toISOString(), quien: "usted" } });
      const r = await marcarTecnico(donde, id, paso, deshacer);
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(
        deshacer
          ? "Listo, se quitó la marca"
          : paso === "salio"
            ? "Marcado: el técnico salió. El cliente recibe el aviso de que va en camino."
            : "Marcado: el técnico llegó al local",
      );
      router.refresh();
    });
  }

  const filas: { paso: "salio" | "llego"; texto: string; marca: Marca; icono: typeof Car }[] = [
    { paso: "salio", texto: "El técnico salió hacia el cliente", marca: visto.salio, icono: Car },
    { paso: "llego", texto: "El técnico llegó al local", marca: visto.llego, icono: MapPinCheck },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground">El técnico en camino</h2>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        El cliente lo ve en Mi cuenta de efameinsa.com y recibe un aviso cuando el técnico sale.
      </p>
      <ul className="mt-3 space-y-2">
        {filas.map(({ paso, texto, marca, icono: Icono }) => {
          const hecho = Boolean(marca.at);
          // «Llegó» sin «salió» se permite (el técnico ya estaba en la zona), pero
          // deshacer «salió» con «llegó» marcado no: primero se deshace la llegada.
          const bloqueadoDeshacer = paso === "salio" && Boolean(visto.llego.at);
          return (
            <li key={paso} className={cn("rounded-md border px-3 py-2 text-xs", hecho ? "border-[#1E7F4F]/30 bg-[#1E7F4F]/5" : "border-border")}>
              <div className="flex items-start gap-2">
                {hecho ? <Check className="mt-0.5 size-3.5 flex-none text-[#1E7F4F]" /> : <Icono className="mt-0.5 size-3.5 flex-none text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{texto}</p>
                  {hecho && (
                    <p className="text-muted-foreground">
                      {fechaHoraLima(marca.at)}
                      {marca.quien ? ` · ${marca.quien}` : ""}
                    </p>
                  )}
                </div>
                {puede && !hecho && !cerrado && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={pendiente} onClick={() => correr(paso, false)}>
                    {pendiente ? <Loader2 className="size-3 animate-spin" /> : "Marcar ahora"}
                  </Button>
                )}
                {puede && hecho && !bloqueadoDeshacer && (
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => correr(paso, true)}
                    className="inline-flex flex-none items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                    title="Quitar la marca si se puso por error"
                  >
                    <Undo2 className="size-3" /> Deshacer
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!puede && <p className="mt-2 text-[11px] text-muted-foreground">Lo marcan postventa, el almacén o gerencia.</p>}
    </div>
  );
}
