"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, CircleDashed, OctagonAlert } from "lucide-react";
import { fechaLimaCorta } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import type { FilaTabla, PasoTabla } from "@/components/crm/tabla-por-paso";

/**
 * LAS FILAS DE «POR PASO», AGRUPADAS POR EMPRESA Y DESPLEGABLES.
 *
 * Reunión del 23-09, mirando esta misma tabla: «creo que esta es solamente
 * por cliente, no por producto… si el cliente tiene cinco equipos… si le
 * damos clic se aparece su desglosado, su desglosado de su máquina». Y las
 * chicas de postventa: que se pueda desplegar cada empresa para ver sus casos.
 *
 * Cada empresa es una fila con su flecha: en cada columna, el paso resumido
 * para todos sus pedidos (✓ si está hecho en todos, «faltan N» si no). Al
 * desplegarla aparece cada pedido con sus pasos y la descripción completa de
 * la máquina, que antes quedaba cortada en una línea.
 */
export function FilasPorPaso({
  filas,
  columnas,
  falta,
}: {
  filas: FilaTabla[];
  columnas: { clave: string; etiqueta: string }[];
  falta: string | null;
}) {
  // Las empresas en el orden en que aparece su primer pedido.
  const grupos: { cliente: string; pedidos: FilaTabla[] }[] = [];
  for (const f of filas) {
    const g = grupos.find((x) => x.cliente === f.cliente);
    if (g) g.pedidos.push(f);
    else grupos.push({ cliente: f.cliente, pedidos: [f] });
  }
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const alternar = (c: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  const todosAbiertos = grupos.length > 0 && grupos.every((g) => abiertos.has(g.cliente));

  return (
    <>
      <tr className="border-b border-border bg-background">
        <td colSpan={columnas.length + 1} className="px-2 py-1.5">
          <span className="text-[11px] text-muted-foreground">
            {grupos.length} empresa{grupos.length === 1 ? "" : "s"} · {filas.length} pedido{filas.length === 1 ? "" : "s"}. Toque la flecha para ver los pedidos de cada una y su máquina.
          </span>
          <button
            type="button"
            className="ml-3 text-[11px] font-medium text-primary hover:underline"
            onClick={() => setAbiertos(todosAbiertos ? new Set() : new Set(grupos.map((g) => g.cliente)))}
          >
            {todosAbiertos ? "Plegar todo" : "Desplegar todo"}
          </button>
        </td>
      </tr>
      {grupos.map((g) => {
        const abierto = abiertos.has(g.cliente);
        return (
          <Fragment key={g.cliente}>
            <tr className={cn("cursor-pointer border-b border-border hover:bg-accent/40", abierto && "bg-secondary/30")} onClick={() => alternar(g.cliente)}>
              <td className="sticky left-0 bg-card px-2 py-1.5">
                <span className="flex min-w-44 max-w-64 items-start gap-1.5">
                  {abierto ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-primary" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0">
                    <span className="line-clamp-1 break-words font-semibold text-foreground" title={g.cliente}>
                      {g.cliente}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {g.pedidos.length === 1 ? (
                        <span className="line-clamp-1" title={g.pedidos[0].equipo}>
                          {g.pedidos[0].equipo}
                        </span>
                      ) : (
                        <b className="font-semibold text-primary">{g.pedidos.length} pedidos</b>
                      )}
                    </span>
                  </span>
                </span>
              </td>
              {columnas.map((c) =>
                g.pedidos.length === 1 ? (
                  <Celda key={c.clave} p={g.pedidos[0].pasos.find((x) => x.clave === c.clave)} siguiente={g.pedidos[0].pasos.find((x) => !x.hecho)?.clave === c.clave} marcada={falta === c.clave} />
                ) : (
                  <CeldaResumen key={c.clave} pasos={g.pedidos.map((f) => f.pasos.find((x) => x.clave === c.clave)).filter(Boolean) as PasoTabla[]} marcada={falta === c.clave} />
                ),
              )}
            </tr>
            {abierto &&
              g.pedidos.map((f) => (
                <Fragment key={f.id}>
                  {g.pedidos.length > 1 && (
                    <tr className="border-b border-border/60 bg-secondary/20">
                      <td className="sticky left-0 bg-secondary/20 py-1.5 pl-8 pr-2">
                        <Link href={`/postventa/pedidos/${f.id}`} className="block min-w-44 max-w-64 text-[11px] font-medium text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>
                          <span className="line-clamp-1">{f.equipo.split("\n")[0]}</span>
                        </Link>
                      </td>
                      {columnas.map((c) => (
                        <Celda key={c.clave} p={f.pasos.find((x) => x.clave === c.clave)} siguiente={f.pasos.find((x) => !x.hecho)?.clave === c.clave} marcada={falta === c.clave} />
                      ))}
                    </tr>
                  )}
                  {/* El desglose de la máquina y lo que le falta. */}
                  <tr className="border-b border-border bg-secondary/10">
                    <td colSpan={columnas.length + 1} className="py-2 pl-8 pr-3">
                      <div className="sticky left-8 max-w-3xl space-y-1.5">
                        <p className="whitespace-pre-line text-[11px] leading-relaxed text-foreground">{f.equipo}</p>
                        <p className="text-[11px] text-muted-foreground">
                          <b className="font-semibold text-foreground">Falta:</b> {f.pasos.filter((p) => !p.hecho).map((p) => p.etiqueta).join(" · ") || "nada"}
                        </p>
                        <Link href={`/postventa/pedidos/${f.id}`} className="inline-block rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-primary hover:bg-accent">
                          Abrir el pedido
                        </Link>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
          </Fragment>
        );
      })}
    </>
  );
}

function Celda({ p, siguiente, marcada }: { p: PasoTabla | undefined; siguiente: boolean; marcada: boolean }) {
  if (!p) return <td className="px-2 py-1.5 text-center text-muted-foreground/40">·</td>;
  return (
    <td
      className={cn("px-2 py-1.5 text-center align-middle", marcada && !p.hecho && "bg-primary/5")}
      title={p.hecho ? `${p.etiqueta} · ${p.cuando ? fechaLimaCorta(p.cuando) : "hecho"}` : p.trabado ? `${p.etiqueta} · ${p.trabado}` : `${p.etiqueta} · le toca a ${p.dueno}`}
    >
      {p.hecho ? (
        <span className="inline-flex flex-col items-center text-[#1E7F4F]">
          <Check className="size-4" />
          {p.cuando && <span className="text-[10px] tabular-nums text-muted-foreground">{fechaLimaCorta(p.cuando)}</span>}
        </span>
      ) : p.trabado ? (
        <span className="inline-flex flex-col items-center text-destructive">
          <OctagonAlert className="size-4" />
          <span className="text-[10px]">{p.dueno}</span>
        </span>
      ) : siguiente ? (
        <span className="inline-flex flex-col items-center text-amber-700">
          <CircleDashed className="size-4" />
          <span className="text-[10px] font-medium">{p.dueno}</span>
        </span>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )}
    </td>
  );
}

/** El paso de varios pedidos en una celda: ✓ si está en todos, «faltan N» si no. */
function CeldaResumen({ pasos, marcada }: { pasos: PasoTabla[]; marcada: boolean }) {
  if (pasos.length === 0) return <td className="px-2 py-1.5 text-center text-muted-foreground/40">·</td>;
  const faltan = pasos.filter((p) => !p.hecho).length;
  const trabados = pasos.filter((p) => !p.hecho && p.trabado).length;
  return (
    <td className={cn("px-2 py-1.5 text-center align-middle", marcada && faltan > 0 && "bg-primary/5")}>
      {faltan === 0 ? (
        <Check className="mx-auto size-4 text-[#1E7F4F]" />
      ) : (
        <span className={cn("text-[10px] font-semibold", trabados > 0 ? "text-destructive" : "text-amber-700")}>
          faltan {faltan}
          {faltan < pasos.length ? ` de ${pasos.length}` : ""}
        </span>
      )}
    </td>
  );
}
