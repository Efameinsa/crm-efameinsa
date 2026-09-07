import Link from "next/link";
import { Search, FileText, ExternalLink } from "lucide-react";
import { requerirRol } from "@/lib/auth";
import { buscarEnTodo, type TipoResultado } from "@/lib/buscar-en-todo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * «¿Dónde está esto?» — una caja y una respuesta.
 *
 * Pedido de gerencia desde la demo del 14-08 («busca cualquier cliente y ve a
 * quién pertenece»), y la pregunta que más se repite en las reuniones: 57 de
 * las 260 que hizo el ing. Carlos en las grabaciones empiezan con «¿dónde…?».
 *
 * Se escribe lo que alguien dijo en voz alta —un número de presupuesto, un RUC,
 * media razón social, la serie de una máquina— y la pantalla contesta las tres
 * cosas que se preguntan juntas en una reunión: QUÉ es, DE QUIÉN es y EN QUÉ
 * ESTADO está. Sin elegir antes en qué tabla buscar, porque quien pregunta no
 * siempre sabe qué tiene en la mano.
 */

const EJEMPLOS = ["Presu_562-26", "014-2026", "PRO-09158", "20100160375", "SIERRA TRAVEL"];

/** Color del distintivo por tipo. El estado se lee antes que el texto. */
const TONO: Record<TipoResultado, string> = {
  cliente: "bg-primary/10 text-primary",
  cotizacion: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  cotizacion_historica: "bg-muted text-muted-foreground",
  cierre: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
  contacto: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  equipo: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  pedido: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
};

export default async function BuscarPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requerirRol(["gerencia", "admin", "central", "operaciones"]);
  const { q } = await searchParams;
  const consulta = (q ?? "").trim();
  const hallazgos = consulta ? await buscarEnTodo(consulta) : null;

  return (
    <SeccionPanel titulo="Buscar en todo el CRM">
      <p className="mb-3 max-w-2xl text-xs text-muted-foreground">
        Escriba lo que le dijeron: un número de presupuesto, un cierre, un RUC, parte del nombre del cliente,
        la serie de una máquina o un número de pedido. No hace falta decir qué es.
      </p>

      <form className="flex gap-2" action="/gerencia/buscar">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={consulta}
            autoFocus
            placeholder="Presu_562-26, 014-2026, PRO-09158, 20100160375, SIERRA TRAVEL…"
            className="pl-8"
          />
        </div>
        <Button type="submit" size="sm">
          Buscar
        </Button>
      </form>

      {!hallazgos && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Ejemplos:</span>
          {EJEMPLOS.map((e) => (
            <Link
              key={e}
              href={`/gerencia/buscar?q=${encodeURIComponent(e)}`}
              className="rounded-md border border-border px-2 py-1 font-mono text-[11px] hover:bg-accent"
            >
              {e}
            </Link>
          ))}
        </div>
      )}

      {hallazgos && hallazgos.total === 0 && (
        <p className="mt-5 text-sm text-muted-foreground">
          No hay nada que diga «{hallazgos.consulta}» — ni cliente, ni presupuesto, ni cierre, ni contacto, ni
          equipo, ni pedido. Si es un documento viejo, puede estar en el archivo del servidor y no en el CRM.
        </p>
      )}

      {hallazgos && hallazgos.total > 0 && (
        <div className="mt-5 space-y-5">
          <p className="text-xs text-muted-foreground">
            {hallazgos.total} resultado{hallazgos.total === 1 ? "" : "s"} para «
            <b className="text-foreground">{hallazgos.consulta}</b>»
          </p>

          {hallazgos.grupos.map((g) => (
            <div key={g.tipo}>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {g.etiqueta} ({g.items.length})
              </h3>
              <ul className="space-y-1.5">
                {g.items.map((r, i) => (
                  <li
                    key={`${g.tipo}-${i}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-border bg-card p-3"
                  >
                    <span className={cn("rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold", TONO[g.tipo])}>
                      {r.titulo}
                    </span>
                    {r.cliente && <span className="font-medium text-foreground">{r.cliente}</span>}
                    {/* De quién es: es la mitad de la pregunta que se hace en la reunión. */}
                    {r.responsable && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">
                        {r.responsable}
                      </span>
                    )}
                    {r.monto && <span className="font-mono text-sm tabular-nums text-foreground">{r.monto}</span>}
                    <span className="text-xs text-muted-foreground">
                      {[r.estado, r.fecha].filter(Boolean).join(" · ")}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      {r.hrefPdf && (
                        <a
                          href={r.hrefPdf}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          <FileText className="size-3.5" /> PDF
                        </a>
                      )}
                      {r.href && (
                        <Link
                          href={r.href}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          Abrir <ExternalLink className="size-3.5" />
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SeccionPanel>
  );
}
