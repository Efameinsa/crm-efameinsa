"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, ShieldX, Wrench, Plus, X, Star } from "lucide-react";
import { agregarEquipoAlCaso, quitarEquipoDelCaso, vincularEquipoAtencion } from "@/lib/acciones/atenciones";
import { estadoGarantia } from "@/lib/postventa";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export interface EquipoDelCliente {
  id: string;
  serie: string | null;
  modelo_texto: string | null;
  garantia_hasta: string | null;
  ultimo_mantenimiento: string | null;
  fecha_venta: string | null;
}

/**
 * Las máquinas del cliente, dentro de la atención — para el momento en que el
 * cliente manda la foto de la placa y hay que saber DE QUÉ EQUIPO habla.
 *
 * Pedido del ing. Carlos (reunión 01-09): «el cliente puede haber comprado
 * varias veces y varios equipos con diferentes números de serie… me deberían
 * salir aquí las diferentes series que tiene el cliente. Y ahí yo contrasto
 * con lo que tengo y le doy clic → el equipo está en garantía o no».
 *
 * Y desde el 18-09 (0253, otra vez Carlos, por Gary Group): UN CASO PUEDE
 * LLEVAR VARIAS MÁQUINAS. La primera que se elige es la principal —de ella
 * cuelgan la garantía y el circuito—; las demás se agregan al mismo caso y
 * quedan en el historial de cada una. «¿No serían cuatro casos? Sería mucho
 * rollo; mejor que se pueda agregar».
 */
export function EquiposDeLaAtencion({
  atencionId,
  equipos,
  principalId = null,
  adicionalesIds = [],
}: {
  atencionId: string;
  equipos: EquipoDelCliente[];
  principalId?: string | null;
  adicionalesIds?: string[];
}) {
  const router = useRouter();
  const [ocupado, startTransition] = useTransition();

  function vincular(equipoId: string, serie: string | null) {
    startTransition(async () => {
      const r = principalId ? await agregarEquipoAlCaso(atencionId, equipoId) : await vincularEquipoAtencion(atencionId, equipoId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(principalId ? `Equipo ${serie ?? ""} agregado al caso`.trim() : `Equipo ${serie ?? ""} vinculado — garantía verificada`.trim());
      router.refresh();
    });
  }

  function quitar(equipoId: string) {
    startTransition(async () => {
      const r = await quitarEquipoDelCaso(atencionId, equipoId);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  if (equipos.length === 0) {
    // Antes esto mandaba a «registrar la serie desde Equipos», donde tampoco
    // se podía dar de alta nada: el camino terminaba en una pared. Desde la
    // 0181 la máquina se ficha en el Paso 1, acá al lado.
    return (
      <p className="text-sm text-muted-foreground">
        Este cliente todavía no tiene máquinas registradas. Fíchela en el{" "}
        <b className="text-foreground">Paso 1</b>, con lo que le diga el cliente: la serie se puede completar
        después.
      </p>
    );
  }

  const enElCaso = new Set([principalId, ...adicionalesIds].filter(Boolean) as string[]);
  const ordenados = [...equipos].sort((a, b) => Number(enElCaso.has(b.id)) - Number(enElCaso.has(a.id)));

  return (
    <div className="space-y-2">
      {principalId && (
        <p className="text-[11px] text-muted-foreground">
          {enElCaso.size === 1 ? "Una máquina en este caso." : `${enElCaso.size} máquinas en este caso.`} Si el problema abarca otras del cliente,
          agréguelas: quedan en el historial de cada una.
        </p>
      )}
      <ul className={cn("space-y-2", ocupado && "opacity-60")}>
        {ordenados.map((e) => {
          const g = estadoGarantia(e.garantia_hasta);
          const esPrincipal = e.id === principalId;
          const esAdicional = adicionalesIds.includes(e.id);
          return (
            <li key={e.id} className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-2.5", esPrincipal || esAdicional ? "border-[#1E7F4F]/50 bg-[#1E7F4F]/5" : "border-border")}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-mono text-xs font-bold text-foreground">
                  {e.serie ?? "Sin serie"}
                  {esPrincipal && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#1E7F4F]/10 px-1.5 font-sans text-[10px] font-semibold text-[#1E7F4F]">
                      <Star className="size-2.5" /> principal
                    </span>
                  )}
                  {esAdicional && <span className="rounded-full bg-[#1E7F4F]/10 px-1.5 font-sans text-[10px] font-semibold text-[#1E7F4F]">en el caso</span>}
                </p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{e.modelo_texto ?? "Equipo sin modelo"}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                  <span className={cn("inline-flex items-center gap-1 font-semibold", g.vigente ? "text-[#1E7F4F]" : "text-destructive")}>
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
              {esAdicional ? (
                <button type="button" disabled={ocupado} onClick={() => quitar(e.id)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive" title="Quitar del caso">
                  <X className="size-3.5" /> Quitar
                </button>
              ) : esPrincipal ? null : (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => vincular(e.id, e.serie)}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                >
                  {principalId ? (
                    <>
                      <Plus className="size-3.5" /> Agregar al caso
                    </>
                  ) : (
                    "Es esta"
                  )}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
