import { ArrowUpRight, Workflow } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { PROCESOS, type Proceso } from "@/lib/procesos";

// PROCESOS DE LA EMPRESA (Santos, 16-10): los diagramas de postventa para repasar cómo se
// mueve un pedido entre áreas. Cada tarjeta abre el diagrama en una pestaña nueva.
export const dynamic = "force-dynamic";

export default async function ProcesosPage() {
  await requerirPerfil();
  const [macro, ...resto] = PROCESOS;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Workflow className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Procesos de la empresa</h1>
          <p className="text-sm text-muted-foreground">
            Cómo se mueve un pedido entre áreas, paso a paso. Cada diagrama se abre en una pestaña nueva: arrastre para moverse, use la rueda para acercar y el botón «Pantalla completa» para verlo en grande.
          </p>
        </div>
      </div>
      <Tarjeta p={macro} destacada />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {resto.map((p) => (
          <Tarjeta key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}

function Tarjeta({ p, destacada = false }: { p: Proceso; destacada?: boolean }) {
  return (
    <a
      href={`/procesos/${p.id}`}
      target="_blank"
      rel="noopener"
      className={
        "group block rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-md " +
        (destacada ? "border-primary/30 bg-gradient-to-br from-primary/[0.06] to-card" : "border-border/80")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-primary">{p.id.toUpperCase()}</span>
        <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <h2 className="mt-1 text-[15px] font-semibold leading-snug">{p.titulo}</h2>
      <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{p.resumen}</p>
      <p className="mt-2 text-[11.5px] text-muted-foreground/80">{p.areas}</p>
    </a>
  );
}
