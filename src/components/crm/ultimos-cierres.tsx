import { FileCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { bloquesPedido, sinPrecios, type ServicioPostventa } from "@/lib/postventa";
import { fechaCalendario, fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

type Informe = { id: string; codigo: string | null; serie: string | null; fecha: string | null; emitido_at: string | null };

/**
 * LOS DOS ÚLTIMOS CIERRES, ARRIBA, CON CÓMO VA SU PEDIDO.
 *
 * Reunión del 23-09: «Hortifrut principal, sale la cotización… el informe de
 * cierre 1, informe de cierre 2, se van a arrojar los dos últimos, y luego
 * todo el historial». Lo primero que se pregunta quien abre la ficha de un
 * cliente que compra seguido es «¿lo último que compró ya salió?». Antes había
 * que bajar hasta la lista completa de informes y, para el estado, entrar al
 * pedido. Acá va cada cierre en una línea con el estado de su pedido; la
 * lista completa sigue más abajo.
 */
export async function UltimosCierres({ informes }: { informes: Informe[] }) {
  const ultimos = informes.filter((i) => i.emitido_at).slice(0, 2);
  if (ultimos.length === 0) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("servicios_postventa")
    .select("*")
    .in("informe_cierre_id", ultimos.map((i) => i.id));
  const pedidos = ((data ?? []) as unknown as ServicioPostventa[]).map(sinPrecios);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ultimos.map((inf) => {
        const suyos = pedidos.filter((p) => p.informe_cierre_id === inf.id);
        return (
          <div key={inf.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                <FileCheck2 className="size-4 text-muted-foreground" /> Cierre N.º {inf.codigo}
              </p>
              <span className="text-[11px] text-muted-foreground">
                {inf.serie === "OPEN" ? "Open" : "Efameinsa"} · {inf.fecha ? fechaCalendario(inf.fecha) : fechaLima(inf.emitido_at)}
              </span>
            </div>
            {suyos.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Todavía sin pedido en postventa.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {suyos.map((p) => {
                  const { texto, tono } = estadoCorto(p);
                  return (
                    <li key={p.id} className="text-xs">
                      <span className="line-clamp-1 text-foreground" title={p.equipo ?? undefined}>
                        {(p.equipo ?? "").split("\n")[0].trim() || "Pedido"}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          tono === "ok" && "bg-[#E7F4EC] text-[#1E7F4F]",
                          tono === "curso" && "bg-secondary text-foreground",
                          tono === "alerta" && "bg-amber-100 text-amber-900",
                        )}
                      >
                        {texto}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function estadoCorto(p: ServicioPostventa): { texto: string; tono: "ok" | "curso" | "alerta" } {
  if (p.cerrado_at) return { texto: "Pedido cerrado", tono: "ok" };
  if (p.despachado_at) return { texto: `Despachado el ${fechaLima(p.despachado_at)}`, tono: "ok" };
  const siguiente = bloquesPedido(p).flatMap((b) => b.pasos).find((x) => !x.hecho);
  if (!siguiente) return { texto: "En curso", tono: "curso" };
  return { texto: `Falta: ${siguiente.etiqueta}`, tono: siguiente.trabado ? "alerta" : "curso" };
}
