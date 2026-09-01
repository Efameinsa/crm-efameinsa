import Link from "next/link";
import { CircleDashed, OctagonAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { AprobarPedidoBoton } from "@/components/crm/aprobar-pedido-boton";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaLima } from "@/lib/fechas";
import {
  avancePedido,
  bloquesPedido,
  etiquetaResponsable,
  puedeVerPrecios,
  queLoFrena,
  sinPrecios,
  type ServicioPostventa,
} from "@/lib/postventa";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * El control de los pedidos — el Excel de Hever, como tablero de fases.
 *
 * Pedido del ing. Carlos (01-09): «el concepto de ese Excel, el CONTROL de
 * ese Excel es lo que te menciono». La primera versión fue una matriz de
 * nueve columnas de símbolos y Santos la vetó el mismo día: «no me parece
 * amigable». Tenía razón — una matriz obliga a leer celda por celda sin
 * jerarquía. La pregunta real del área es «¿qué tengo en cada fase y qué me
 * toca mover?», y eso se responde con TRES columnas —las mismas tres fases
 * que ya agrupan la ficha del pedido (bloquesPedido)— y una tarjeta por
 * pedido con lo esencial: cliente, equipo, avance y qué lo frena. El detalle
 * de los diez pasos vive en la ficha, a un clic, como el patrón de
 * seguimiento de encomienda que pidió Santos.
 */

const FASES = [
  { numero: 1 as const, titulo: "① Preparación" },
  { numero: 2 as const, titulo: "② Despacho" },
  { numero: 3 as const, titulo: "③ Puesta en marcha y cierre" },
];

/** La fase EN LA QUE ESTÁ el pedido: el primer bloque incompleto. */
function faseActual(s: ServicioPostventa): 1 | 2 | 3 {
  for (const b of bloquesPedido(s)) if (!b.completo) return b.numero;
  return 3;
}

export default async function ControlPedidosPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  // Solo los pedidos del flujo digital en curso: la cola vieja del Excel se
  // trabaja en Atenciones → Despachos, no acá.
  const { data } = await supabase
    .from("servicios_postventa")
    .select("*")
    .eq("completado", false)
    .is("cerrado_at", null)
    .not("informe_cierre_id", "is", null)
    .order("pedido_ejecutado_at", { ascending: false })
    .limit(80);

  const verPrecios = puedeVerPrecios(perfil);
  const pedidos = ((data ?? []) as unknown as ServicioPostventa[]).map((s) => (verPrecios ? s : sinPrecios(s)));

  const porFase = new Map<number, ServicioPostventa[]>([[1, []], [2, []], [3, []]]);
  for (const s of pedidos) porFase.get(faseActual(s))!.push(s);

  return (
    <SeccionPanel
      titulo="Control de pedidos"
      accion={
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
          {pedidos.length} en curso
        </span>
      }
    >
      <p className="mb-4 max-w-prose text-xs text-muted-foreground">
        Cada pedido está en la fase donde le falta trabajo. La tarjeta dice qué lo frena y de quién depende; tocarla
        abre el expediente con los diez pasos del circuito.
      </p>

      {pedidos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay pedidos del flujo en curso ahora mismo.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {FASES.map((fase) => {
            const lista = porFase.get(fase.numero) ?? [];
            return (
              <div key={fase.numero} className="rounded-xl border border-border bg-secondary/30 p-3">
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <h3 className="text-[12px] font-bold uppercase tracking-wide text-foreground">{fase.titulo}</h3>
                  <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {lista.length}
                  </span>
                </div>

                {lista.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground/70">Nada en esta fase</p>
                ) : (
                  <div className="space-y-2">
                    {lista.map((s) => {
                      const frena = queLoFrena(s);
                      const avance = avancePedido(s);
                      const pct = Math.round((avance.hechos / avance.total) * 100);
                      // El único movimiento que se hace DESDE la tarjeta es el
                      // que es 100 % de postventa y no pide ningún dato: el
                      // acuse de aprobar (Santos, 01-09: «¿por qué no se puede
                      // mover de un estadio a otro?» — arrastrar no, porque la
                      // fase es un hecho con evidencia; actuar sí). El resto de
                      // pasos pide datos y vive en la ficha.
                      const puedeAprobar = !s.aprobado_at && s.informe_cierre_id != null;
                      return (
                        <div
                          key={s.id}
                          className={cn(
                            "relative rounded-lg border bg-card p-3 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40",
                            frena?.grave ? "border-amber-400/60" : "border-border",
                          )}
                        >
                          <Link
                            href={`/postventa/pedidos/${s.id}`}
                            className="absolute inset-0 rounded-lg"
                            aria-label={`Abrir el pedido de ${s.cliente_texto ?? "cliente"}`}
                          />
                          <p className="line-clamp-1 text-sm font-semibold text-foreground">
                            {(s.cliente_texto ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "")}
                          </p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{s.equipo ?? "Sin equipo"}</p>

                          {/* El avance, de un vistazo: la barra dice cuánto
                              camino lleva sin pedir leer ningún símbolo. */}
                          <div className="mt-2 flex items-center gap-2">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                              <span
                                className={cn("block h-full", pct === 100 ? "bg-[#1E7F4F]" : "bg-primary")}
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              {avance.hechos}/{avance.total}
                            </span>
                          </div>

                          {frena ? (
                            <p
                              className={cn(
                                "mt-2 flex items-start gap-1.5 text-xs",
                                frena.grave ? "font-semibold text-amber-800" : "text-muted-foreground",
                              )}
                            >
                              {frena.grave ? (
                                <OctagonAlert className="mt-0.5 size-3.5 flex-none" />
                              ) : (
                                <CircleDashed className="mt-0.5 size-3.5 flex-none" />
                              )}
                              <span>
                                {frena.texto} · <b>{etiquetaResponsable(frena.responsable)}</b>
                              </span>
                            </p>
                          ) : (
                            <p className="mt-2 text-xs font-semibold text-[#1E7F4F]">Listo para cerrar</p>
                          )}

                          {s.fecha_despacho && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                              Despacho: {fechaLima(s.fecha_despacho)}
                            </p>
                          )}

                          {puedeAprobar && (
                            <div className="relative z-10 mt-2">
                              <AprobarPedidoBoton servicioId={s.id} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        La cola vieja del Excel se sigue trabajando en Atenciones → Despachos.
      </p>
    </SeccionPanel>
  );
}
