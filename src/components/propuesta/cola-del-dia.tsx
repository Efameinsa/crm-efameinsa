import Link from "next/link";
import { AlertTriangle, ArrowRight, Barcode, CalendarClock, CalendarDays, ClipboardList, FileText, Inbox, Package, PhoneForwarded, Sun, Truck, UserRound, Wallet, Wrench } from "lucide-react";
import { TARJETA } from "@/components/propuesta/kit";
import type { EventoAgenda, Tarea, TipoTarea, Urgencia } from "@/lib/propuesta/cola-del-dia";
import { cn } from "@/lib/utils";

const GRUPOS: { clave: Urgencia; titulo: string; ayuda: string }[] = [
  { clave: "atrasado", titulo: "Atrasado", ayuda: "Ya pasó su momento: primero esto." },
  { clave: "hoy", titulo: "Hoy", ayuda: "Lo que toca hoy." },
  { clave: "semana", titulo: "Esta semana", ayuda: "Para adelantar si queda tiempo." },
];
const ICONO: Record<TipoTarea, typeof Package> = {
  pedido: Package,
  apertura: PhoneForwarded,
  atencion: Wrench,
  caso: ClipboardList,
  cliente: UserRound,
  despacho: Truck,
  pago: Wallet,
  liquidacion: FileText,
  serie: Barcode,
  contacto: Inbox,
};
const FILTRO: Record<TipoTarea, string> = {
  pedido: "Pedidos",
  despacho: "Despachos",
  apertura: "Aperturas",
  atencion: "Casos técnicos",
  caso: "Seguimientos",
  cliente: "Clientes",
  pago: "Pagos",
  liquidacion: "Liquidaciones",
  serie: "Series",
  contacto: "Contactos",
};
const POR_GRUPO = 15;

/**
 * «HOY» DE LA PROPUESTA: LA COLA DE TRABAJO. Cada fila es una cosa por hacer
 * con un solo botón; arriba cuánto hay de cada urgencia, al costado la
 * agenda con hora. Los filtros y el «ver todas» van en la URL, así funciona
 * sin JavaScript y se puede compartir.
 */
export function ColaDelDia({
  nombre,
  tareas,
  agenda,
  ver,
  todo,
  base = "/nuevo",
  enNumeros,
}: {
  nombre: string;
  tareas: Tarea[];
  agenda: EventoAgenda[];
  ver: string | null;
  todo: string | null;
  base?: string;
  enNumeros?: { etiqueta: string; href: string };
}) {
  const hora = Number(new Date().toLocaleTimeString("en-GB", { timeZone: "America/Lima", hour: "2-digit", hour12: false }));
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const tipos = [...new Set(tareas.map((t) => t.tipo))];
  const visibles = ver ? tareas.filter((t) => t.tipo === ver) : tareas;
  const cuenta = (u: Urgencia) => visibles.filter((t) => t.urgencia === u).length;
  const url = (p: { ver?: string | null; todo?: string | null }) => {
    const q = new URLSearchParams();
    if (p.ver) q.set("ver", p.ver);
    if (p.todo) q.set("todo", p.todo);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const fecha = new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        <div className={cn("flex flex-wrap items-end justify-between gap-3 propuesta-hero p-5", TARJETA)}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fecha}</p>
            <h1 className="text-[22px] font-bold text-foreground">
              {saludo}, {/^(postventa|almac[eé]n|central|finanzas)/i.test(nombre) ? nombre : nombre.split(" ")[0]}
            </h1>
            <p className="text-sm text-muted-foreground">
              {tareas.length === 0 ? "No hay nada pendiente. Buen momento para adelantar la semana." : tareas.length === 1 ? "Tienes 1 cosa por hacer." : `Tienes ${tareas.length} cosas por hacer. Empieza por arriba.`}
            </p>
          </div>
          {enNumeros && (
            <Link href={enNumeros.href} className="text-xs font-medium text-primary hover:underline">
              {enNumeros.etiqueta} →
            </Link>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {GRUPOS.map((g) => {
            const n = cuenta(g.clave);
            const IconoGrupo = g.clave === "atrasado" ? AlertTriangle : g.clave === "hoy" ? Sun : CalendarClock;
            const tinte = g.clave === "atrasado" && n > 0 ? "bg-destructive/10 text-destructive" : g.clave === "hoy" && n > 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "bg-secondary text-foreground/60";
            return (
              <a key={g.clave} href={`#${g.clave}`} className={cn("group/num levanta flex items-center gap-3 p-4 hover:border-[var(--c-celeste)]/50", TARJETA)}>
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover/num:scale-110", tinte)}>
                  <IconoGrupo className="size-[18px]" />
                </span>
                <span>
                  <p className={cn("text-[22px] font-bold leading-none tabular-nums", g.clave === "atrasado" && n > 0 ? "text-destructive" : "text-foreground")}>{n}</p>
                  <p className="mt-1 text-xs font-semibold text-foreground">{g.titulo}</p>
                </span>
              </a>
            );
          })}
        </div>

        {tipos.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <Link href={url({})} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", !ver ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent")}>
              Todo ({tareas.length})
            </Link>
            {tipos.map((t) => (
              <Link
                key={t}
                href={url({ ver: t })}
                className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", ver === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent")}
              >
                {FILTRO[t]} ({tareas.filter((x) => x.tipo === t).length})
              </Link>
            ))}
          </div>
        )}

        {GRUPOS.map((g) => {
          const lista = visibles.filter((t) => t.urgencia === g.clave);
          if (lista.length === 0) return null;
          const mostrar = todo === g.clave ? lista : lista.slice(0, POR_GRUPO);
          return (
            <section key={g.clave} id={g.clave} className="scroll-mt-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className={cn("text-sm font-bold uppercase tracking-wide", g.clave === "atrasado" ? "text-destructive" : "text-foreground")}>
                  {g.clave === "atrasado" && <AlertTriangle className="mr-1 inline size-4 align-[-3px]" />}
                  {g.titulo} · {lista.length}
                </h2>
                <span className="text-[11px] text-muted-foreground">{g.ayuda}</span>
              </div>
              <ul className="space-y-2">
                {mostrar.map((t) => {
                  const Icono = ICONO[t.tipo];
                  return (
                    <li key={t.id} className={cn("flex items-center gap-3 p-3 transition-colors hover:border-primary/30", TARJETA)}>
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg",
                          g.clave === "atrasado" ? "bg-destructive/10 text-destructive" : "bg-secondary text-foreground",
                        )}
                      >
                        <Icono className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{t.que}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <b className="font-medium text-foreground">{t.cliente}</b> · {t.porque}
                        </p>
                      </div>
                      <Link
                        href={t.accion.href}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors",
                          g.clave === "semana" ? "border border-border bg-card text-foreground hover:bg-accent" : "bg-primary text-primary-foreground hover:bg-primary/90",
                        )}
                      >
                        {t.accion.etiqueta} <ArrowRight className="size-3.5" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {lista.length > mostrar.length && (
                <Link href={url({ ver, todo: g.clave })} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
                  Ver las {lista.length} de «{g.titulo}»
                </Link>
              )}
            </section>
          );
        })}
      </div>

      <aside className="space-y-4">
        <div className={TARJETA}>
          <h2 className="flex items-center gap-2 border-b border-border/80 px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-foreground">
            <CalendarDays className="size-4 text-primary" /> Tu agenda de hoy
          </h2>
          {agenda.length === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">Nada con hora para hoy.</p>
          ) : (
            <ol className="relative px-4 py-3">
              {agenda.map((e) => (
                <li key={e.id} className="relative flex gap-3 pb-3 last:pb-0">
                  <span className="w-12 shrink-0 pt-0.5 text-xs font-bold tabular-nums text-foreground">{e.hora}</span>
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  <Link href={e.href} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate text-xs font-semibold text-foreground">{e.titulo}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{e.detalle}</p>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="rounded-xl border border-dashed border-border p-4 text-[11px] leading-relaxed text-muted-foreground">
          <CalendarClock className="mb-1 size-4" />
          Así propone la nueva vista abrir el día: lo que pide acción, en el orden en que se trabaja. Los números completos siguen a un clic.
        </div>
      </aside>
    </div>
  );
}
