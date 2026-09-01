"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, ShieldX, Wrench } from "lucide-react";
import { vincularEquipoAtencion } from "@/lib/acciones/atenciones";
import { estadoGarantia } from "@/lib/postventa";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * Las máquinas del cliente, dentro de la atención — para el momento en que el
 * cliente manda la foto de la placa y hay que saber DE QUÉ EQUIPO habla.
 *
 * Pedido del ing. Carlos (reunión 01-09): «el cliente puede haber comprado
 * varias veces y varios equipos con diferentes números de serie… me deberían
 * salir aquí las diferentes series que tiene el cliente. Y ahí yo contrasto
 * con lo que tengo y le doy clic → el equipo está en garantía o no».
 *
 * Un clic vincula la máquina y verifica la garantía en el acto (queda escrita
 * con fecha, `verificarGarantia`). La fecha de garantía sale del parque
 * instalado: hoy se alimenta de los cierres y sus fechas; cuando se carguen
 * las guías de remisión será exacta desde la salida del equipo.
 */
export function EquiposDeLaAtencion({
  atencionId,
  equipos,
}: {
  atencionId: string;
  equipos: {
    id: string;
    serie: string | null;
    modelo_texto: string | null;
    garantia_hasta: string | null;
    ultimo_mantenimiento: string | null;
    fecha_venta: string | null;
  }[];
}) {
  const router = useRouter();
  const [ocupado, startTransition] = useTransition();

  function vincular(equipoId: string, serie: string | null) {
    startTransition(async () => {
      const r = await vincularEquipoAtencion(atencionId, equipoId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Equipo ${serie ?? ""} vinculado — garantía verificada`.trim());
      router.refresh();
    });
  }

  if (equipos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este cliente no tiene máquinas en el parque instalado todavía. Si manda la foto de la placa, la serie se
        registra desde Equipos.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-2", ocupado && "opacity-60")}>
      {equipos.map((e) => {
        const g = estadoGarantia(e.garantia_hasta);
        return (
          <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs font-bold text-foreground">{e.serie ?? "Sin serie"}</p>
              <p className="line-clamp-1 text-xs text-muted-foreground">{e.modelo_texto ?? "Equipo sin modelo"}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-semibold",
                    g.vigente ? "text-[#1E7F4F]" : "text-destructive",
                  )}
                >
                  {g.vigente ? <ShieldCheck className="size-3" /> : <ShieldX className="size-3" />}
                  {g.etiqueta}
                </span>
                {e.ultimo_mantenimiento && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Wrench className="size-3" /> últ. mant. {fechaLima(e.ultimo_mantenimiento)}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => vincular(e.id, e.serie)}
              className="rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              Es esta
            </button>
          </li>
        );
      })}
    </ul>
  );
}
