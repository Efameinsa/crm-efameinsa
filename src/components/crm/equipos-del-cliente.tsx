import Link from "next/link";
import { ShieldCheck, ShieldOff, ShieldQuestion, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaCalendario } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * El parque instalado del cliente, dentro de la pantalla donde se lo atiende.
 *
 * POR QUÉ. El ing. Carlos abrió un caso de postventa el 31-08 y preguntó dos
 * cosas seguidas: «acá tendría que aparecer si está en garantía o no» y «te
 * falta servirle para que salga el historial del cliente, y ahí sí se puede ver
 * cuándo le pusimos en marcha, si está en garantía». Es la información con la
 * que el área decide si el servicio se cobra, y estaba a dos pantallas de
 * distancia.
 *
 * LOS TRES ESTADOS DE LA GARANTÍA, Y POR QUÉ SON TRES.
 * De los 314 equipos del parque, solo 11 tienen fecha de garantía cargada: son
 * los que pasaron por el CRM. Los otros 303 vinieron del Excel con su serie, su
 * modelo y su mantenimiento, pero sin fechas.
 *
 * Por eso NO se dice «sin garantía» cuando no se sabe. Decirlo sería empujar a
 * cobrarle a un cliente que quizá está cubierto, que es peor que no decir nada.
 * Cuando falta el dato, la pantalla lo dice con todas las letras y pide
 * verificarlo.
 */

interface EquipoInstalado {
  id: string;
  serie: string;
  modelo_texto: string | null;
  fecha_puesta_marcha: string | null;
  garantia_meses: number | null;
  garantia_hasta: string | null;
  ultimo_mantenimiento: string | null;
  proximo_mantenimiento: string | null;
  ciclos_ultimo: number | null;
}

type EstadoGarantia = "vigente" | "vencida" | "sin_dato";

function estadoGarantia(e: EquipoInstalado): EstadoGarantia {
  if (!e.garantia_hasta) return "sin_dato";
  return e.garantia_hasta >= new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" })
    ? "vigente"
    : "vencida";
}

export async function EquiposDelCliente({ cuentaId }: { cuentaId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("equipos_instalados")
    .select(
      "id, serie, modelo_texto, fecha_puesta_marcha, garantia_meses, garantia_hasta, ultimo_mantenimiento, proximo_mantenimiento, ciclos_ultimo",
    )
    .eq("cuenta_id", cuentaId)
    .order("fecha_puesta_marcha", { ascending: false, nullsFirst: false })
    .limit(40);

  const equipos = (data ?? []) as unknown as EquipoInstalado[];
  if (equipos.length === 0) return null;

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const enGarantia = equipos.filter((e) => estadoGarantia(e) === "vigente").length;
  const sinDato = equipos.filter((e) => estadoGarantia(e) === "sin_dato").length;
  const nuncaMantenimiento = equipos.filter((e) => !e.ultimo_mantenimiento).length;

  return (
    <SeccionPanel
      titulo={`Equipos de este cliente (${equipos.length})`}
      accion={
        <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {enGarantia > 0 && (
            <span className="rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 font-semibold text-[#1E7F4F]">
              {enGarantia} en garantía
            </span>
          )}
          {sinDato > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700">
              {sinDato} sin fecha de garantía
            </span>
          )}
        </span>
      }
    >
      {/* La venta cruzada que él describió sin llamarla así: «verifico que
          nunca le hemos hecho el preventivo → le cotizo el repuesto y también
          el preventivo». Va arriba porque es lo que se le dice al cliente
          mientras se lo tiene al teléfono. */}
      {nuncaMantenimiento > 0 && (
        <p className="mb-3 rounded-md border-l-[3px] border-amber-500 bg-amber-500/5 px-3 py-2 text-xs text-amber-900">
          <b>{nuncaMantenimiento}</b> {nuncaMantenimiento === 1 ? "equipo nunca tuvo" : "equipos nunca tuvieron"} un
          mantenimiento registrado. Es el momento de ofrecer el preventivo.
        </p>
      )}

      <div className="space-y-1.5">
        {equipos.map((e) => {
          const gar = estadoGarantia(e);
          // El «próximo mantenimiento» solo vale si es POSTERIOR al último. El
          // import dejó un caso —la serie 804KWCF35059, atendida el 28-08-2026
          // con próximo fechado en febrero de 2025— y mostrarlo como vencido
          // sería marcar en rojo una máquina que acaban de atender. Cuando la
          // fecha no puede ser, se dice que hay que reprogramarla.
          const proximoConfiable =
            e.proximo_mantenimiento && (!e.ultimo_mantenimiento || e.proximo_mantenimiento > e.ultimo_mantenimiento);
          const mttoVencido = proximoConfiable && e.proximo_mantenimiento! < hoy;
          return (
            <Link
              key={e.id}
              href={`/postventa/equipos/${e.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border p-2.5 transition-colors hover:bg-accent"
            >
              <span className="w-32 flex-none font-mono text-xs font-semibold text-foreground">{e.serie}</span>
              <span className="min-w-[160px] flex-1 truncate text-xs text-muted-foreground">
                {e.modelo_texto ?? "Sin modelo"}
              </span>

              {/* La garantía, con sus tres estados. */}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  gar === "vigente"
                    ? "bg-[#1E7F4F]/10 text-[#1E7F4F]"
                    : gar === "vencida"
                      ? "bg-secondary text-muted-foreground"
                      : "bg-amber-500/10 text-amber-700",
                )}
              >
                {gar === "vigente" ? (
                  <>
                    <ShieldCheck className="size-3" /> En garantía hasta {fechaCalendario(e.garantia_hasta!)}
                  </>
                ) : gar === "vencida" ? (
                  <>
                    <ShieldOff className="size-3" /> Garantía vencida el {fechaCalendario(e.garantia_hasta!)}
                  </>
                ) : (
                  <>
                    <ShieldQuestion className="size-3" /> Garantía sin registrar — verificar
                  </>
                )}
              </span>

              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[11px]",
                  mttoVencido ? "font-semibold text-destructive" : "text-muted-foreground",
                )}
              >
                <Wrench className="size-3" />
                {e.ultimo_mantenimiento
                  ? `Último mtto. ${fechaCalendario(e.ultimo_mantenimiento)}`
                  : "Nunca tuvo mantenimiento"}
                {proximoConfiable
                  ? ` · próximo ${fechaCalendario(e.proximo_mantenimiento!)}${mttoVencido ? " (vencido)" : ""}`
                  : e.proximo_mantenimiento
                    ? " · próximo por reprogramar"
                    : ""}
              </span>

              {e.fecha_puesta_marcha && (
                <span className="text-[11px] text-muted-foreground">
                  Puesta en marcha {fechaCalendario(e.fecha_puesta_marcha)}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {sinDato > 0 && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
          «Garantía sin registrar» no quiere decir que no tenga: quiere decir que la fecha no está cargada. De los
          314 equipos del parque, solo los que pasaron por el CRM la traen. Antes de cobrar un servicio hay que
          verificarla contra el informe de puesta en marcha.
        </p>
      )}
    </SeccionPanel>
  );
}
