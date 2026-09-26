import Link from "next/link";
import { Package, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { bloquesPedido, circuitoDe, etiquetaResponsable, sinPrecios, type ServicioPostventa } from "@/lib/postventa";
import { fechaCalendario, fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * EL ESTADO DEL PEDIDO, EN EL EXPEDIENTE DEL COMERCIAL.
 *
 * Carlos lo pidió en varias reuniones y lo repitió el 22-09 con Rivera en
 * pantalla, mientras el comercial y postventa se enteraban por WhatsApp de
 * lo que el otro hacía: «el comercial tiene que ver una tablita del estatus
 * del pedido. Un resumen muy puntual nada más. Si no, van a ponerse a
 * preguntar a postventa. Cada área va a estar independiente, pero sí tienen
 * que estar informados».
 *
 * Es solo lectura y no muestra montos. Lo que muestra es en qué paso está
 * cada pedido vivo del cliente, quién tiene que moverlo y para cuándo está
 * programado el despacho. El comercial no entra a la pantalla de postventa
 * (no es de su área) ni la necesita: con esto sabe qué contestarle al cliente
 * que le escribe «¿cuándo sale mi máquina?».
 *
 * La política `servicios_pv_comercial` (0088) ya le deja leer los pedidos de
 * sus clientes; postventa y gerencia los ven por las suyas.
 */
export async function EstadoDelPedido({ cuentaId, conEnlace = false }: { cuentaId: string; conEnlace?: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("servicios_postventa")
    .select("*")
    .eq("cuenta_id", cuentaId)
    .is("cerrado_at", null)
    .order("created_at", { ascending: false })
    .limit(5);
  const pedidos = ((data ?? []) as unknown as ServicioPostventa[]).map(sinPrecios);
  if (pedidos.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-foreground">
          <Package className="size-4" /> Estado del pedido
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">{pedidos.length}</span>
        </h2>
        <span className="text-[11px] text-muted-foreground">Lo lleva postventa; acá se ve en qué va</span>
      </div>
      <ul className="divide-y divide-border">
        {pedidos.map((s) => {
          const circuito = circuitoDe(s);
          const bloques = bloquesPedido(s);
          const pasos = bloques.flatMap((b) => b.pasos);
          const hechos = pasos.filter((p) => p.hecho).length;
          const siguiente = pasos.find((p) => !p.hecho) ?? null;
          const equipo = (s.equipo ?? "").split("\n")[0].trim() || "Equipo";
          return (
            <li key={s.id} className="px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground" title={s.equipo ?? undefined}>
                    {equipo}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {circuito.esAccesorio ? "Accesorio" : circuito.esRepuesto ? "Repuesto" : circuito.esServicio ? "Servicio" : "Venta de equipo"}
                    {s.numero_pedido_erp ? ` · pedido ERP ${s.numero_pedido_erp}` : ""}
                    {s.fecha_confirmacion ? ` · cierre del ${fechaCalendario(s.fecha_confirmacion)}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                  {hechos} de {pasos.length} pasos
                </span>
              </div>

              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pasos.length ? Math.round((hechos / pasos.length) * 100) : 0}%` }} />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {s.despachado_at ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-[#1E7F4F]">
                    <Truck className="size-3.5" /> Despachado el {fechaLima(s.despachado_at)}
                    {s.guia ? ` · guía ${s.guia}` : ""}
                  </span>
                ) : s.fecha_despacho ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                    <Truck className="size-3.5" /> Despacho programado: {fechaCalendario(s.fecha_despacho)}
                    {s.despacho_hora ? ` a las ${String(s.despacho_hora).slice(0, 5)}` : ""}
                    {s.almacen_listo_at ? " · almacén confirmó" : " · almacén sin confirmar"}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Despacho sin fecha todavía</span>
                )}
                {siguiente && (
                  <span className={cn("text-muted-foreground", siguiente.trabado && "text-amber-800")}>
                    Sigue: <b className="text-foreground">{siguiente.etiqueta}</b> · {etiquetaResponsable(siguiente.responsable)}
                    {siguiente.trabado ? ` · ${siguiente.trabado}` : ""}
                  </span>
                )}
              </div>
              {s.puesta_en_marcha && !s.cerrado_at && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Puesta en marcha: {fechaCalendario(s.puesta_en_marcha)}
                  {s.modalidad === "provincia" ? " (remota)" : ""}
                </p>
              )}
              {conEnlace && (
                <Link href={`/postventa/pedidos/${s.id}`} className="mt-1 inline-block text-[11px] text-primary hover:underline">
                  Abrir el pedido
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
