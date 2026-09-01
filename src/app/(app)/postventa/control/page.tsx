import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import {
  bloquesPedido,
  esProvincia,
  etiquetaResponsable,
  puedeVerPrecios,
  queLoFrena,
  sinPrecios,
  type PasoPedido,
  type ServicioPostventa,
} from "@/lib/postventa";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * El tablero de control de los pedidos — el Excel de Hever, digital.
 *
 * Pedido del ing. Carlos en la reunión del 01-09, buscándolo en vivo: «¿si
 * había sido enviado el plan de preinstalación? ¿Dónde estaban los estatus?
 * […] el concepto de ese Excel, el CONTROL de ese Excel es lo que te
 * menciono. Controlamos eso».
 *
 * Una fila por pedido en curso, una columna por paso del circuito, y en cada
 * celda el estatus con su fecha. Es la MISMA información de la ficha del
 * pedido (bloquesPedido), mirada todas juntas — nada se calcula distinto acá.
 */

// Las columnas: la unión de los pasos del circuito, en su orden. La
// preinstalación solo existe en provincia; en Lima la celda dice «—».
const COLUMNAS: { clave: string; titulo: string }[] = [
  { clave: "aprobado", titulo: "Aprobado" },
  { clave: "prueba", titulo: "Probado" },
  { clave: "plano", titulo: "Plano" },
  { clave: "pago", titulo: "Pago" },
  { clave: "direccion", titulo: "Dirección" },
  { clave: "preinstalacion", titulo: "Preinst." },
  { clave: "despacho", titulo: "Despacho" },
  { clave: "puesta", titulo: "P. marcha" },
  { clave: "cerrado", titulo: "Cierre" },
];

function diaCorto(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", timeZone: "America/Lima" });
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

  return (
    <SeccionPanel
      titulo="Control de pedidos"
      accion={
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
          {pedidos.length} en curso
        </span>
      }
    >
      <p className="mb-3 max-w-prose text-xs text-muted-foreground">
        Cada fila es un pedido en curso; cada columna, un paso del circuito con su fecha. Es el control que antes
        vivía en el Excel del área. Tocar la fila abre el expediente del pedido.
      </p>

      {pedidos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay pedidos del flujo en curso ahora mismo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-semibold text-muted-foreground">Cliente / equipo</th>
                {COLUMNAS.map((c) => (
                  <th key={c.clave} className="px-1.5 py-2 text-center font-semibold text-muted-foreground">
                    {c.titulo}
                  </th>
                ))}
                <th className="py-2 pl-2 font-semibold text-muted-foreground">Lo frena</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((s) => {
                const pasos = new Map<string, PasoPedido>(
                  bloquesPedido(s).flatMap((b) => b.pasos.map((p) => [p.clave, p])),
                );
                const frena = queLoFrena(s);
                const provincia = esProvincia(s);
                return (
                  <tr key={s.id} className="border-b border-border/60 transition-colors hover:bg-accent/40">
                    <td className="max-w-[240px] py-2 pr-3">
                      <Link href={`/postventa/pedidos/${s.id}`} className="group block">
                        <span className="line-clamp-1 font-semibold text-foreground group-hover:text-primary">
                          {(s.cliente_texto ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "")}
                        </span>
                        <span className="line-clamp-1 text-muted-foreground">{s.equipo ?? "Sin equipo"}</span>
                      </Link>
                    </td>
                    {COLUMNAS.map((c) => {
                      const paso = pasos.get(c.clave);
                      if (!paso) {
                        return (
                          <td key={c.clave} className="px-1.5 py-2 text-center text-muted-foreground/50">
                            {c.clave === "preinstalacion" && !provincia ? "—" : "—"}
                          </td>
                        );
                      }
                      return (
                        <td key={c.clave} className="px-1.5 py-2 text-center">
                          {paso.hecho ? (
                            <span className="inline-flex flex-col items-center leading-tight text-[#1E7F4F]">
                              <span className="font-bold">✓</span>
                              {paso.cuando && <span className="text-[10px]">{diaCorto(paso.cuando)}</span>}
                            </span>
                          ) : paso.trabado ? (
                            <span className="font-bold text-amber-600" title={paso.trabado}>
                              ●
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">○</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="max-w-[220px] py-2 pl-2">
                      {frena ? (
                        <span className={cn("line-clamp-2", frena.grave ? "font-semibold text-amber-800" : "text-muted-foreground")}>
                          {frena.texto} · {etiquetaResponsable(frena.responsable)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#1E7F4F]">
                          Completo <ArrowRight className="size-3" />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        ✓ hecho (con su fecha) · ● trabado (pase el mouse para ver por qué) · ○ pendiente · — no aplica. La cola
        vieja del Excel se sigue trabajando en Atenciones → Despachos.
      </p>
    </SeccionPanel>
  );
}
