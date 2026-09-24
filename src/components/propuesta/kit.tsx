import Link from "next/link";
import { ArrowRight, Check, Clock, Hourglass, Inbox, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EL KIT DE LA PROPUESTA (v2, 23-09). Las mismas piezas en todas las
 * secciones, para que quien aprende una pantalla ya sepa leer las demás:
 *
 *  · EncabezadoSeccion: qué es esto, para qué sirve y la acción principal.
 *  · PestanasConteo: las vistas de la sección, cada una con cuántas hay.
 *  · Chips: filtros de un clic, en la URL (se comparten y sobreviven al F5).
 *  · FilaTrabajo: una cosa por hacer — quién, qué, en qué estado, a quién se
 *    espera, desde cuándo, y UN botón con el siguiente paso.
 *  · Pasos: la línea del circuito, con quién tiene cada paso.
 *  · Vacio: nunca una pantalla en blanco; dice qué no hay, por qué, y dónde sí.
 *  · Numero: una cifra que se toca y abre su lista.
 *
 * Reglas de uso: un solo botón primario por fila; el estado siempre con
 * texto (no solo color); lo atrasado arriba; nada de jerga de sistema.
 */

export type Tono = "neutro" | "urgente" | "atencion" | "ok" | "info";

const TONO_PILDORA: Record<Tono, string> = {
  neutro: "bg-secondary text-muted-foreground",
  urgente: "bg-destructive/10 text-destructive",
  atencion: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  ok: "bg-[#1E7F4F]/10 text-[#1E7F4F]",
  info: "bg-primary/10 text-primary",
};
const TONO_BORDE: Record<Tono, string> = {
  neutro: "border-l-border",
  urgente: "border-l-destructive",
  atencion: "border-l-amber-500",
  ok: "border-l-[#1E7F4F]",
  info: "border-l-primary",
};

export function Pildora({ tono = "neutro", children, className }: { tono?: Tono; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", TONO_PILDORA[tono], className)}>{children}</span>;
}

export function EncabezadoSeccion({
  titulo,
  proposito,
  accion,
  extra,
}: {
  titulo: string;
  /** Una frase: para qué entra uno acá. */
  proposito: string;
  accion?: { etiqueta: string; href: string } | null;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{titulo}</h1>
        <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{proposito}</p>
      </div>
      <div className="flex items-center gap-2">
        {extra}
        {accion && (
          <Link href={accion.href} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            {accion.etiqueta}
            <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

export interface PestanaConteo {
  etiqueta: string;
  href: string;
  activa: boolean;
  /** Cuántas hay. Si `alerta`, el número va en rojo: hay algo esperando. */
  conteo?: number | null;
  alerta?: boolean;
}

export function PestanasConteo({ pestanas, etiqueta }: { pestanas: PestanaConteo[]; etiqueta: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label={etiqueta}>
      {pestanas.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          aria-current={p.activa ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            p.activa ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {p.etiqueta}
          {p.conteo != null && (
            <span
              className={cn(
                "min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums",
                p.alerta && p.conteo > 0 ? "bg-destructive text-white" : "bg-secondary text-muted-foreground",
              )}
            >
              {p.conteo}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export function Chips({ opciones, etiqueta }: { opciones: { etiqueta: string; href: string; activa: boolean; conteo?: number }[]; etiqueta: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-pressed={o.activa}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            o.activa ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-accent",
          )}
        >
          {o.etiqueta}
          {o.conteo != null && <span className={cn("tabular-nums", o.activa ? "opacity-90" : "text-muted-foreground")}>{o.conteo}</span>}
        </Link>
      ))}
    </div>
  );
}

export interface DatosFila {
  /** Lo primero que se lee: el cliente o la cosa. */
  titulo: string;
  href?: string;
  /** Una línea: qué es (equipo, cierre, pedido). */
  sub?: string | null;
  estado?: { texto: string; tono: Tono } | null;
  /** A quién se espera, si no es a quien mira: «Esperando a Finanzas». */
  espera?: string | null;
  /** Desde cuándo, ya escrito: «hace 3 d», «vence hoy». */
  edad?: string | null;
  edadTono?: Tono;
  /** El siguiente paso. Uno solo. */
  accion?: { etiqueta: string; href: string } | null;
  tono?: Tono;
  /** Datos cortos a la derecha del título (monto, serie…). */
  dato?: React.ReactNode;
}

export function FilaTrabajo({ f }: { f: DatosFila }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 border-l-4 bg-card px-4 py-3", TONO_BORDE[f.tono ?? "neutro"])}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {f.href ? (
            <Link href={f.href} className="truncate text-sm font-semibold text-foreground hover:underline">
              {f.titulo}
            </Link>
          ) : (
            <span className="truncate text-sm font-semibold text-foreground">{f.titulo}</span>
          )}
          {f.estado && <Pildora tono={f.estado.tono}>{f.estado.texto}</Pildora>}
          {f.dato}
        </div>
        {f.sub && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{f.sub}</p>}
        {(f.espera || f.edad) && (
          <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
            {f.espera && (
              <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
                <Hourglass className="size-3" />
                {f.espera}
              </span>
            )}
            {f.edad && (
              <span className={cn("inline-flex items-center gap-1", f.edadTono === "urgente" ? "font-semibold text-destructive" : f.edadTono === "atencion" ? "font-semibold text-amber-800" : "text-muted-foreground")}>
                <Clock className="size-3" />
                {f.edad}
              </span>
            )}
          </p>
        )}
      </div>
      {f.accion && (
        <Link
          href={f.accion.href}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
        >
          {f.accion.etiqueta}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </li>
  );
}

/** Un grupo de filas con su título y su cuenta. */
export function Grupo({
  titulo,
  ayuda,
  conteo,
  tono = "neutro",
  children,
  pie,
}: {
  titulo: string;
  ayuda?: string;
  conteo?: number;
  tono?: Tono;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{titulo}</h2>
          {conteo != null && <Pildora tono={conteo > 0 ? tono : "neutro"}>{conteo}</Pildora>}
        </div>
        {ayuda && <p className="hidden text-xs text-muted-foreground sm:block">{ayuda}</p>}
      </header>
      <ul className="divide-y divide-border">{children}</ul>
      {pie && <div className="border-t border-border px-4 py-2 text-xs">{pie}</div>}
    </section>
  );
}

export type EstadoPaso = "hecho" | "actual" | "pendiente" | "bloqueado";
export interface PasoLinea {
  etiqueta: string;
  estado: EstadoPaso;
  /** Quién lo tiene o quién lo hizo. */
  quien?: string | null;
  /** Cuándo se hizo, ya escrito. */
  cuando?: string | null;
  nota?: string | null;
}

/** La línea del circuito: el paso actual resalta y dice quién lo tiene. */
export function Pasos({ pasos, compacto = false }: { pasos: PasoLinea[]; compacto?: boolean }) {
  return (
    <ol className={cn("grid gap-2", compacto ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-8" : "sm:grid-cols-2 lg:grid-cols-4")}>
      {pasos.map((p, i) => (
        <li
          key={p.etiqueta}
          className={cn(
            "rounded-lg border p-2.5",
            p.estado === "hecho" && "border-[#1E7F4F]/30 bg-[#1E7F4F]/5",
            p.estado === "actual" && "border-primary bg-primary/5 ring-1 ring-primary/30",
            p.estado === "pendiente" && "border-border bg-background",
            p.estado === "bloqueado" && "border-dashed border-border bg-muted/40",
          )}
          aria-current={p.estado === "actual" ? "step" : undefined}
        >
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px]",
                p.estado === "hecho" ? "bg-[#1E7F4F] text-white" : p.estado === "actual" ? "bg-primary text-primary-foreground" : "border border-foreground/30 text-muted-foreground",
              )}
            >
              {p.estado === "hecho" ? <Check className="size-3" /> : p.estado === "bloqueado" ? <Lock className="size-2.5" /> : i + 1}
            </span>
            <span className={p.estado === "hecho" ? "text-[#1E7F4F]" : p.estado === "actual" ? "text-primary" : "text-muted-foreground"}>{p.etiqueta}</span>
          </p>
          {!compacto && (p.quien || p.cuando || p.nota) && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {p.estado === "actual" && p.quien ? <b className="text-foreground">Le toca a {p.quien}</b> : p.quien}
              {p.cuando ? `${p.quien ? " · " : ""}${p.cuando}` : ""}
              {p.nota ? <span className="block">{p.nota}</span> : null}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Nunca en blanco: qué no hay, por qué, y adónde ir. */
export function Vacio({ titulo, porque, accion }: { titulo: string; porque: string; accion?: { etiqueta: string; href: string } | null }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <Inbox className="size-6 text-muted-foreground" />
      <p className="text-sm font-semibold text-foreground">{titulo}</p>
      <p className="max-w-md text-xs text-muted-foreground">{porque}</p>
      {accion && (
        <Link href={accion.href} className="mt-1 text-xs font-semibold text-primary hover:underline">
          {accion.etiqueta} →
        </Link>
      )}
    </div>
  );
}

/** Una cifra que se toca y abre su lista. */
export function Numero({ etiqueta, valor, sub, href, tono = "neutro" }: { etiqueta: string; valor: number | string; sub?: string; href?: string; tono?: Tono }) {
  const cuerpo = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", tono === "urgente" && Number(valor) > 0 ? "text-destructive" : tono === "atencion" && Number(valor) > 0 ? "text-amber-700" : "text-foreground")}>
        {valor}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </>
  );
  const clase = "block rounded-xl border border-border bg-card p-3 transition-colors";
  return href ? (
    <Link href={href} className={cn(clase, "hover:border-primary/40 hover:bg-accent/40")}>
      {cuerpo}
    </Link>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

/** «hace 3 d», «hoy», «hace 5 h»: la edad de algo, en palabras. */
export function haceCuanto(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "hace minutos";
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "desde ayer" : `hace ${d} d`;
}
