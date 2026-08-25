import Link from "next/link";
import { AlertTriangle, Wrench, PackageSearch, CalendarClock, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaLima, fechaHoraLima } from "@/lib/fechas";

export const dynamic = "force-dynamic";

/**
 * La pantalla con la que postventa arranca el día.
 *
 * QUÉ HACE EL ÁREA, según la reunión del 25-08 con el ing. Carlos: Central
 * recibe la llamada y la deriva. Son dos clases de caso —«en garantía el
 * cliente dice que su máquina no está operativa» y «necesito un repuesto,
 * normalmente manda foto por WhatsApp»— más el mantenimiento preventivo.
 * Postventa toma la llamada, averigua, gestiona y lo registra.
 *
 * Y en paralelo lleva LA AGENDA: por cada venta confirmada sigue el abono, la
 * prueba y embalaje, el despacho, los planos de preinstalación y la puesta en
 * marcha. Eso vivía en `R:\COPIA CRM POST VENTA\RESUMEN AGENDA DE POST VENTA`
 * y son compromisos con fecha que ya corren, por eso están acá arriba.
 *
 * LO QUE TODAVÍA NO PUEDE HACER: cotizar. Carlos fue explícito — hacen falta
 * las fichas de repuestos y de mantenimiento preventivo, que no están cargadas.
 * Hasta entonces cotizan a mano, fuera del sistema, con el rango de numeración
 * que gerencia les dio.
 */

const ETIQUETA_TIPO: Record<string, string> = {
  garantia: "Garantía",
  repuesto: "Repuesto",
  mantenimiento: "Mantenimiento",
};

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export default async function PostventaPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  const [{ data: casos }, { data: proximos }, { data: porCoordinar }, { data: soporte }, { count: completados }] =
    await Promise.all([
      // Lo que Central le derivó y todavía no se cerró.
      supabase
        .from("oportunidades")
        .select("id, etapa, intencion, tipo_postventa, created_at, proxima_accion, proxima_accion_at, cuentas(razon_social)")
        .eq("comercial_id", perfil.id)
        .not("etapa", "in", "(venta,rechazada)")
        .order("created_at", { ascending: false })
        .limit(50),
      // Despachos y puestas en marcha con fecha. SIN piso de fecha a propósito:
      // al cargar su Excel aparecieron 57 pendientes con fecha ya vencida y 1
      // solo de hoy en adelante. Filtrar por «de hoy en adelante» habría dejado
      // la pantalla casi vacía escondiendo justo lo que hay que resolver.
      supabase
        .from("servicios_postventa")
        .select("*")
        .eq("completado", false)
        .not("fecha_despacho", "is", null)
        .order("fecha_despacho")
        .limit(30),
      // Lo pendiente SIN fecha: es donde se pierde el trabajo. En su Excel son
      // las filas que dicen «POR COORDINAR» o «PROGRAMAR ENTREGA PARA…».
      supabase
        .from("servicios_postventa")
        .select("*")
        .eq("completado", false)
        .is("fecha_despacho", null)
        .order("fecha_confirmacion", { ascending: true, nullsFirst: false })
        .limit(25),
      supabase.from("soporte_tecnico").select("*").order("fecha_ejecutado", { ascending: false }).limit(8),
      supabase.from("servicios_postventa").select("id", { count: "exact", head: true }).eq("completado", true),
    ]);

  const atrasados = (proximos ?? []).filter((s) => s.fecha_despacho && s.fecha_despacho < hoy);

  return (
    <div className="space-y-4">
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
              return (
                <Link
                  key={c.id}
                  href={`/comercial/oportunidades/${c.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3 shadow-sm transition-colors hover:bg-accent"
                >
                  <span className="flex size-9 flex-none items-center justify-center rounded-full bg-secondary text-foreground">
                    {tipo === "garantia" ? (
                      <ShieldCheck className="size-4" />
                    ) : tipo === "repuesto" ? (
                      <PackageSearch className="size-4" />
                    ) : (
                      <Wrench className="size-4" />
                    )}
                  </span>
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {cuenta?.razon_social ?? "Cliente sin nombre"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tipo ? ETIQUETA_TIPO[tipo] ?? tipo : "Sin clasificar"} · {c.intencion ?? "sin detalle"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-medium capitalize text-foreground">
                      {c.etapa}
                    </span>
                    <br />
                    {fechaHoraLima(c.created_at)}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SeccionPanel>

      <SeccionPanel
        titulo="Despachos y puestas en marcha con fecha"
        accion={
          <Link href="/postventa/agenda" className="text-xs font-medium text-primary hover:underline">
            Ver la agenda completa
          </Link>
        }
      >
        {atrasados.length > 0 && (
          <p className="mb-2 flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-900">
            <AlertTriangle className="size-3.5" />
            {atrasados.length} con la fecha ya vencida y sin marcar como completados. Al subir el Excel venían así:
            conviene revisarlos y cerrar los que ya se hicieron.
          </p>
        )}
        {!proximos || proximos.length === 0 ? (
          <Vacio>No hay despachos pendientes con fecha.</Vacio>
        ) : (
          <div className="space-y-1.5">
            {proximos.map((s) => (
              <div key={s.id} className="flex flex-wrap items-start gap-3 rounded-md border border-border p-2.5">
                <span className="flex w-24 flex-none items-center gap-1.5 text-xs font-semibold tabular-nums text-foreground">
                  <CalendarClock className="size-3.5 text-muted-foreground" />
                  {fechaLima(s.fecha_despacho)}
                </span>
                <div className="min-w-[200px] flex-1">
                  <p className="text-sm font-medium text-foreground">{s.cliente_texto ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{s.equipo?.slice(0, 120) ?? "Sin equipo"}</p>
                  {s.observaciones && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{s.observaciones.slice(0, 140)}</p>
                  )}
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
                  {s.tipo_servicio}
                </span>
              </div>
            ))}
          </div>
        )}
      </SeccionPanel>

      <SeccionPanel
        titulo="Por coordinar"
        accion={
          porCoordinar && porCoordinar.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              {porCoordinar.length} sin fecha
            </span>
          ) : undefined
        }
      >
        {/* Sin fecha, un compromiso desaparece. En el Excel estas filas dicen
            «POR COORDINAR» y solo se recordaban leyendo la planilla entera. */}
        {!porCoordinar || porCoordinar.length === 0 ? (
          <Vacio>Todo lo pendiente tiene fecha.</Vacio>
        ) : (
          <div className="space-y-1.5">
            {porCoordinar.map((s) => (
              <div key={s.id} className="flex flex-wrap items-start gap-3 rounded-md border border-border p-2.5">
                <div className="min-w-[200px] flex-1">
                  <p className="text-sm font-medium text-foreground">{s.cliente_texto ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{s.equipo?.slice(0, 120) ?? "Sin equipo"}</p>
                </div>
                <div className="text-right text-[11px] text-muted-foreground">
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground">
                    {s.tipo_servicio}
                  </span>
                  {s.despacho_nota && <p className="mt-1 max-w-[220px]">{s.despacho_nota}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SeccionPanel>

      <SeccionPanel
        titulo="Últimos informes de soporte técnico"
        accion={
          <Link href="/postventa/soporte" className="text-xs font-medium text-primary hover:underline">
            Ver todos
          </Link>
        }
      >
        {!soporte || soporte.length === 0 ? (
          <Vacio>Sin informes cargados.</Vacio>
        ) : (
          <div className="space-y-1.5">
            {soporte.map((s) => (
              <div key={s.id} className="rounded-md border border-border p-2.5">
                <p className="text-sm font-medium text-foreground">{s.cliente_texto}</p>
                <p className="text-xs text-muted-foreground">{s.equipo}</p>
                <p className="mt-0.5 text-xs">
                  <span className="font-semibold text-foreground">{s.detalle}</span>
                  {s.fecha_ejecutado && (
                    <span className="text-muted-foreground"> · ejecutado {fechaLima(s.fecha_ejecutado)}</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </SeccionPanel>

      <p className="px-1 text-xs text-muted-foreground">
        {completados ?? 0} servicios ya completados están en la agenda, con su historial.
      </p>
    </div>
  );
}
