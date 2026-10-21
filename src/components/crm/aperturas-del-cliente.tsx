import Link from "@/components/enlace";
import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * LAS APERTURAS DE SERVICIO DEL CLIENTE, EN SU FICHA (gerencia, reunión del
 * 20-10-2026 15:45, Lino Espíritu): «todas las aperturas tienen que estar
 * relacionadas con el caso… deberían haber varias aperturas al lado, acá a la
 * derecha, esta es la ficha total del cliente… está bien escondido, tienes que
 * abrir el caso para verlo».
 *
 * Cada apertura con su caso, si es externa (el técnico sale) o interna (el
 * equipo viene a planta), y en qué va: emitida, Contabilidad confirmó la guía,
 * salió, cerrada. Las últimas ocho; si no hay ninguna, no aparece.
 */
export async function AperturasDelCliente({ cuentaId }: { cuentaId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("servicios_postventa")
    .select("id, apertura_despacho_at, apertura_fecha, apertura_tipo, apertura_modalidad, tipo_servicio, guia_confirmada_at, despachado_at, cerrado_at, tecnico_asignado, atenciones!atenciones_servicio_id_fkey(id, codigo)")
    .eq("cuenta_id", cuentaId)
    .not("apertura_despacho_at", "is", null)
    .order("apertura_despacho_at", { ascending: false })
    .limit(8);
  const filas = (data ?? []) as unknown as {
    id: string;
    apertura_despacho_at: string;
    apertura_fecha: string | null;
    apertura_modalidad: string | null;
    tipo_servicio: string | null;
    guia_confirmada_at: string | null;
    despachado_at: string | null;
    cerrado_at: string | null;
    tecnico_asignado: string | null;
    atenciones: { id: string; codigo: string | null }[] | null;
  }[];
  if (filas.length === 0) return null;

  const estado = (f: (typeof filas)[number]) =>
    f.cerrado_at
      ? { texto: "cerrada", color: "bg-secondary text-muted-foreground" }
      : f.despachado_at
        ? { texto: f.apertura_modalidad === "interna" ? "el equipo está en planta" : "el técnico salió", color: "bg-[#1E7F4F]/10 text-[#1E7F4F]" }
        : f.guia_confirmada_at
          ? { texto: "guía confirmada, por salir", color: "bg-sky-500/10 text-sky-800 dark:text-sky-300" }
          : { texto: "emitida, falta la guía de Contabilidad", color: "bg-amber-500/10 text-amber-900 dark:text-amber-300" };

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <ClipboardList className="size-4 text-primary" /> Aperturas de servicio ({filas.length})
      </h2>
      <ul className="space-y-2">
        {filas.map((f) => {
          const e = estado(f);
          const caso = (f.atenciones ?? [])[0] ?? null;
          return (
            <li key={f.id} className="text-xs">
              <Link href={`/postventa/pedidos/${f.id}`} className="font-medium text-primary hover:underline">
                {f.apertura_modalidad === "interna" ? "Interna (en planta)" : "Externa (sale el técnico)"} · {f.tipo_servicio ?? "Servicio"}
              </Link>
              <p className="text-muted-foreground">
                {f.apertura_fecha ? `para el ${fechaLima(`${f.apertura_fecha}T12:00:00`)}` : `emitida el ${fechaLima(f.apertura_despacho_at)}`}
                {f.tecnico_asignado ? ` · ${f.tecnico_asignado}` : ""}
                {caso?.codigo && (
                  <>
                    {" · "}
                    <Link href={`/postventa/atenciones/${caso.id}`} className="font-semibold text-foreground hover:underline">
                      {caso.codigo}
                    </Link>
                  </>
                )}
              </p>
              <span className={cn("mt-0.5 inline-flex rounded-full px-1.5 py-px text-[10px] font-semibold", e.color)}>{e.texto}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
