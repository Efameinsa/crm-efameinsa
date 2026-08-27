import Link from "next/link";
import { AlertTriangle, Wrench, PackageSearch, ShieldCheck, Inbox, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaLima, fechaHoraLima } from "@/lib/fechas";
import { AprobarPedidoBoton } from "@/components/crm/aprobar-pedido-boton";
import {
  queLoFrena,
  slaCaso,
  etiquetaEtapaPostventa,
  etiquetaResponsable,
  type ServicioPostventa,
} from "@/lib/postventa";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Con lo que postventa arranca el día.
 *
 * Antes esta pantalla listaba todo lo pendiente ordenado por fecha, y como el
 * Excel traía 57 filas vencidas de 2025, lo primero que se veía era el año
 * pasado. Carlos lo dijo mirándola: «primero debería salir lo último que están
 * gestionando». Así que ahora responde otra pregunta: **qué tengo que hacer
 * ahora**. Todo lo demás se mudó a la agenda, que es donde se busca.
 *
 * Tres bloques y ninguno más:
 *   · lo que Central acaba de liberar y espera el acuse,
 *   · lo que vence hoy o ya venció,
 *   · los casos con su reloj corriendo.
 */

const ETIQUETA_TIPO: Record<string, string> = {
  garantia: "Garantía",
  repuesto: "Repuesto",
  mantenimiento: "Mantenimiento",
};

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="max-w-prose text-sm text-muted-foreground">{children}</p>;
}

export default async function PostventaPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const enUnaSemana = new Date(new Date().getTime() + 7 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  const [{ data: nuevos }, { data: enGestion }, { data: casos }, { count: sinFecha }] = await Promise.all([
    // Liberados por Central (los dos checks) y todavía sin acuse.
    supabase
      .from("servicios_postventa")
      .select("*")
      .not("pedido_ejecutado_at", "is", null)
      .not("liquidacion_at", "is", null)
      .is("aprobado_at", null)
      .eq("completado", false)
      .order("pedido_ejecutado_at", { ascending: false })
      .limit(20),
    // Lo abierto con fecha para hoy, para esta semana, o ya vencida. Lo de más
    // adelante no compite por la atención de hoy.
    //
    // SIN filtrar por `aprobado_at` a propósito: las 106 filas pendientes que
    // vinieron del Excel nunca pasaron por el acuse, y exigirlo dejaría la
    // pantalla vacía escondiendo el trabajo real. El acuse ordena los pedidos
    // NUEVOS; no es un requisito para ver lo que ya estaba en curso.
    supabase
      .from("servicios_postventa")
      .select("*")
      .eq("completado", false)
      .or(`fecha_despacho.lte.${enUnaSemana},puesta_en_marcha.lte.${enUnaSemana}`)
      .order("fecha_despacho", { ascending: true, nullsFirst: false })
      .limit(40),
    supabase
      .from("oportunidades")
      .select("id, etapa, intencion, tipo_postventa, created_at, cuentas(razon_social)")
      .eq("comercial_id", perfil.id)
      .not("etapa", "in", "(venta,rechazada)")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("servicios_postventa")
      .select("id", { count: "exact", head: true })
      .eq("completado", false)
      .is("fecha_despacho", null),
  ]);

  const gestion = (enGestion ?? []) as unknown as ServicioPostventa[];
  const atrasados = gestion.filter((s) => s.fecha_despacho && s.fecha_despacho < hoy && !s.despachado_at);
  const alDia = gestion.filter((s) => !atrasados.includes(s));

  return (
    <div className="space-y-4">
      <SeccionPanel
        titulo="Nuevos pedidos"
        accion={
          nuevos && nuevos.length > 0 ? (
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
              {nuevos.length} esperando acuse
            </span>
          ) : undefined
        }
      >
        {!nuevos || nuevos.length === 0 ? (
          <Vacio>
            No hay pedidos nuevos. Aparecen acá en cuanto Central marca «pedido ejecutado» y «liquidación» sobre un
            cierre de venta — con todo lo que el comercial adjuntó, sin esperar el file impreso.
          </Vacio>
        ) : (
          <div className="space-y-2">
            {(nuevos as unknown as ServicioPostventa[]).map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3"
              >
                <span className="flex size-9 flex-none items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Inbox className="size-4" />
                </span>
                <div className="min-w-[220px] flex-1">
                  <Link href={`/postventa/pedidos/${s.id}`} className="text-sm font-semibold hover:underline">
                    {s.cliente_texto ?? "Cliente sin nombre"}
                  </Link>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{s.equipo ?? "Sin equipo"}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {s.monto ? `${s.moneda} ${Number(s.monto).toLocaleString("es-PE")}` : "sin monto"}
                    {s.forma_pago && ` · ${s.forma_pago}`}
                    {s.modalidad && ` · ${s.modalidad}`}
                    {s.pedido_ejecutado_at && ` · liberado ${fechaHoraLima(s.pedido_ejecutado_at)}`}
                  </p>
                </div>
                <AprobarPedidoBoton servicioId={s.id} />
              </div>
            ))}
          </div>
        )}
      </SeccionPanel>

      <SeccionPanel
        titulo="Para esta semana"
        accion={
          <Link href="/postventa/agenda" className="text-xs font-medium text-primary hover:underline">
            Ver la agenda completa
          </Link>
        }
      >
        {atrasados.length > 0 && (
          <p className="mb-2 flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-900">
            <AlertTriangle className="size-3.5" />
            {atrasados.length} con la fecha ya vencida.
          </p>
        )}
        {gestion.length === 0 ? (
          <Vacio>
            Nada con fecha para esta semana.
            {(sinFecha ?? 0) > 0 && (
              <>
                {" "}
                Hay <strong>{sinFecha}</strong> pendientes sin fecha en la agenda: sin fecha, un compromiso desaparece.
              </>
            )}
          </Vacio>
        ) : (
          <div className="space-y-1.5">
            {[...atrasados, ...alDia].map((s) => {
              const frena = queLoFrena(s);
              const vencido = s.fecha_despacho && s.fecha_despacho < hoy && !s.despachado_at;
              return (
                <Link
                  key={s.id}
                  href={`/postventa/pedidos/${s.id}`}
                  className={cn(
                    "flex flex-wrap items-start gap-3 rounded-md border p-2.5 transition-colors hover:bg-accent",
                    vencido ? "border-amber-300 bg-amber-50/60" : "border-border",
                  )}
                >
                  <span
                    className={cn(
                      "w-20 flex-none font-mono text-xs font-semibold tabular-nums",
                      vencido ? "text-amber-800" : "text-foreground",
                    )}
                  >
                    {fechaLima(s.fecha_despacho ?? s.puesta_en_marcha)}
                  </span>
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-medium text-foreground">{s.cliente_texto ?? "—"}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{s.equipo ?? "Sin equipo"}</p>
                  </div>
                  {frena && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        frena.grave ? "bg-amber-100 text-amber-900" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {frena.grave ? frena.texto : etiquetaResponsable(frena.responsable)}
                    </span>
                  )}
                  <ArrowRight className="mt-1 size-3.5 flex-none text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
      </SeccionPanel>

      <SeccionPanel
        titulo="Casos derivados por Central"
        accion={
          casos && casos.length > 0 ? (
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
              {casos.length} abierto{casos.length === 1 ? "" : "s"}
            </span>
          ) : undefined
        }
      >
        {!casos || casos.length === 0 ? (
          <Vacio>
            Todavía no le derivaron ningún caso. Cuando Central registre una llamada de garantía, de repuesto o de
            mantenimiento y se la asigne, va a aparecer acá.
          </Vacio>
        ) : (
          <div className="space-y-2">
            {casos.map((c) => {
              const tipo = c.tipo_postventa as string | null;
              const cuenta = c.cuentas as unknown as { razon_social: string } | null;
              const atendido = c.etapa !== "asignada";
              const sla = slaCaso(tipo, c.created_at as string, atendido);
              return (
                <Link
                  key={c.id}
                  href={`/comercial/oportunidades/${c.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3 shadow-sm transition-colors hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex size-9 flex-none items-center justify-center rounded-full",
                      sla.estado === "rojo"
                        ? "bg-destructive/10 text-destructive"
                        : sla.estado === "ambar"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-secondary text-foreground",
                    )}
                  >
                    {tipo === "garantia" ? (
                      <ShieldCheck className="size-4" />
                    ) : tipo === "repuesto" ? (
                      <PackageSearch className="size-4" />
                    ) : (
                      <Wrench className="size-4" />
                    )}
                  </span>
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-semibold text-foreground">{cuenta?.razon_social ?? "Cliente sin nombre"}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {tipo ? (ETIQUETA_TIPO[tipo] ?? tipo) : "Sin clasificar"} · {c.intencion ?? "sin detalle"}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground">
                      {etiquetaEtapaPostventa(c.etapa as string)}
                    </span>
                    <br />
                    {!atendido && (
                      <span
                        className={cn(
                          "text-[11px] font-semibold",
                          sla.estado === "rojo"
                            ? "text-destructive"
                            : sla.estado === "ambar"
                              ? "text-amber-700"
                              : "text-muted-foreground",
                        )}
                      >
                        {sla.horas < 1
                          ? "recién llegado"
                          : `${Math.round(sla.horas)} h sin atender · límite ${sla.limite} h`}
                      </span>
                    )}
                    {atendido && (
                      <span className="text-[11px] text-muted-foreground">{fechaHoraLima(c.created_at as string)}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SeccionPanel>
    </div>
  );
}
