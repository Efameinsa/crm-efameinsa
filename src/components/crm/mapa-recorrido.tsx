"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/enlace";
import { toast } from "sonner";
import { BellRing, Check, ChevronRight, Loader2, Map as MapaIcono, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apurarDesdeElMapa } from "@/lib/acciones/mapa";
import { ETIQUETA_AREA, areaQueSeApura, haceCuanto, resumenDeRuta, type AreaMapa, type EtapaMapa, type RutaMapa } from "@/lib/mapa-recorrido";
import type { ApurosMapa } from "@/lib/mapa-recorrido-datos";
import { fechaHoraLima, fechaLimaCorta } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * EL MAPA DEL RECORRIDO (Santos, 23-10): una sección «Mapa» que se abre con un
 * clic. Lo hecho en verde suave, lo que falta en rojo, y la etapa donde está
 * atascado palpitando, con «Apurar a <área>». Cada etapa dice qué área la
 * mueve; un clic en cualquiera muestra su detalle debajo.
 */

const COLOR_AREA: Record<AreaMapa, string> = {
  comercial: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  central: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  almacen: "bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-100",
  finanzas: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  contabilidad: "bg-pink-100 text-pink-900 dark:bg-pink-950 dark:text-pink-200",
  postventa: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  tecnico: "bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200",
  cliente: "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
};

const AREA_CORTA: Record<AreaMapa, string> = { ...ETIQUETA_AREA, contabilidad: "Contabilidad", cliente: "Cliente" };

type Estado = "hecho" | "no_aplica" | "actual" | "falta";
const estadoDe = (r: RutaMapa, i: number): Estado => {
  const e = r.etapas[i];
  if (e.hecho) return "hecho";
  if (e.noAplica) return "no_aplica";
  return i === r.actual ? "actual" : "falta";
};

export function MapaRecorrido({ rutas, apuros, ruta, abierto = false }: { rutas: RutaMapa[]; apuros: ApurosMapa; ruta: string; abierto?: boolean }) {
  const [abierta, setAbierta] = useState(abierto);
  if (rutas.length === 0) return null;
  const atascadas = rutas.filter((r) => r.actual >= 0);
  return (
    <div id="mapa" className="scroll-mt-4 rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-foreground">
          <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", abierta && "rotate-90")} />
          <MapaIcono className="size-4 text-primary" />
          Mapa
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {rutas.map((r) => (
            <span key={`${r.tipo}:${r.id}`} className="flex min-w-0 items-center gap-2 text-xs">
              {r.actual >= 0 ? (
                <span className="relative flex size-2.5 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-red-600" />
                </span>
              ) : (
                <Check className="size-3.5 shrink-0 text-emerald-600" />
              )}
              <span className="truncate">
                <span className="font-semibold text-foreground">{r.titulo.length > 34 ? `${r.titulo.slice(0, 32).trimEnd()}…` : r.titulo}:</span>{" "}
                <span className={r.actual >= 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}>{resumenDeRuta(r)}</span>
              </span>
            </span>
          ))}
        </span>
        <span className="text-[11px] font-medium text-primary">{abierta ? "Cerrar" : atascadas.length ? "Ver dónde está" : "Ver el recorrido"}</span>
      </button>
      {abierta && (
        <div className="space-y-5 border-t border-border p-5">
          {rutas.map((r) => (
            <RutaDibujada key={`${r.tipo}:${r.id}`} r={r} apuros={apuros} ruta={ruta} />
          ))}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded border border-emerald-300 bg-emerald-50" /> Hecho</span>
            <span className="inline-flex items-center gap-1.5"><span className="mapa-latir inline-block size-3 rounded border-2 border-red-500 bg-red-50" /> Aquí está atascado</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded border border-red-300 bg-card" /> Falta</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded border border-dashed border-border bg-muted" /> No corresponde</span>
            <span>Toque una etapa para ver su detalle.</span>
          </p>
        </div>
      )}
    </div>
  );
}

function RutaDibujada({ r, apuros, ruta }: { r: RutaMapa; apuros: ApurosMapa; ruta: string }) {
  const [elegida, setElegida] = useState(r.actual >= 0 ? r.actual : r.etapas.length - 1);
  const actualRef = useRef<HTMLButtonElement>(null);
  // Al abrir, la etapa atascada queda a la vista aunque la ruta sea larga.
  useEffect(() => {
    actualRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, []);
  const hechas = r.etapas.filter((e) => e.hecho).length;
  const cuentan = r.etapas.filter((e) => !e.noAplica).length;
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {r.enlace && !ruta.startsWith(r.enlace) ? (
            <Link href={r.enlace} className="text-primary hover:underline">
              {r.titulo}
            </Link>
          ) : (
            r.titulo
          )}
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {hechas} de {cuentan} etapas{r.actual >= 0 && r.desde ? ` · atascado ${haceCuanto(r.desde)} (desde el ${fechaHoraLima(r.desde)})` : ""}
        </span>
      </div>
      <div className="-mx-1 overflow-x-auto px-1 pb-2 pt-1">
        <ol className="flex w-max items-stretch">
          {r.etapas.map((e, i) => {
            const est = estadoDe(r, i);
            const siguienteHecha = i < r.etapas.length - 1 && (r.etapas[i + 1].hecho || r.etapas[i + 1].noAplica);
            const tramoVerde = (est === "hecho" || est === "no_aplica") && siguienteHecha;
            return (
              <li key={`${e.clave}-${i}`} className="flex items-stretch">
                <button
                  type="button"
                  ref={i === r.actual ? actualRef : undefined}
                  onClick={() => setElegida(i)}
                  aria-current={i === r.actual ? "step" : undefined}
                  aria-pressed={elegida === i}
                  className={cn(
                    "flex w-[9.5rem] flex-col gap-1 rounded-lg border p-2 text-left text-[11px] transition outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    est === "hecho" && "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
                    est === "no_aplica" && "border-dashed border-border bg-muted/50 text-muted-foreground",
                    est === "falta" && "border-red-300 bg-card text-red-800 dark:border-red-800 dark:text-red-200",
                    est === "actual" && "mapa-latir border-2 border-red-500 bg-red-50 text-red-950 dark:bg-red-950/50 dark:text-red-100",
                    elegida === i && "ring-2 ring-primary/60 ring-offset-1 ring-offset-card",
                  )}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className={cn("truncate rounded px-1.5 py-px text-[10px] font-semibold", COLOR_AREA[e.area])}>{AREA_CORTA[e.area]}</span>
                    {est === "hecho" ? <Check className="size-3.5 shrink-0 text-emerald-600" /> : est === "no_aplica" ? <Minus className="size-3.5 shrink-0" /> : null}
                  </span>
                  <span className="line-clamp-3 font-semibold leading-snug">{e.etiqueta}</span>
                  <span className="mt-auto truncate text-[10px] opacity-80">
                    {est === "actual"
                      ? `Aquí está${haceCuanto(r.desde) ? ` · ${haceCuanto(r.desde)}` : ""}`
                      : est === "hecho"
                        ? [e.cuando ? fechaLimaCorta(e.cuando) : null, e.quien].filter(Boolean).join(" · ") || "Hecho"
                        : est === "no_aplica"
                          ? "No corresponde"
                          : "Falta"}
                  </span>
                </button>
                {i < r.etapas.length - 1 && (
                  <span aria-hidden className="flex w-6 shrink-0 items-center">
                    <span className={cn("h-0 w-full border-t-2", tramoVerde ? "border-emerald-300 dark:border-emerald-700" : "border-dashed border-red-300 dark:border-red-800")} />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <DetalleEtapa r={r} i={elegida} apuros={apuros} ruta={ruta} />
    </section>
  );
}

function DetalleEtapa({ r, i, apuros, ruta }: { r: RutaMapa; i: number; apuros: ApurosMapa; ruta: string }) {
  const e: EtapaMapa | undefined = r.etapas[i];
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  if (!e) return null;
  const est = estadoDe(r, i);
  const area = areaQueSeApura(e.area);
  const apuro = area ? apuros[`${r.tipo}:${r.id}:${area}`] : undefined;

  function apurar() {
    if (!area || !e) return;
    empezar(async () => {
      const res = await apurarDesdeElMapa({ tipo: r.tipo, id: r.id, area, paso: e.clave, etiqueta: e.etiqueta, ruta });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Listo: ${ETIQUETA_AREA[e.area === "tecnico" ? "postventa" : e.area]} recibió el aviso con sirena${(res.avisoNumero ?? 1) > 1 ? ` (aviso n.º ${res.avisoNumero}; gerencia también se entera)` : ""}.`);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "mt-1 rounded-lg border p-3 text-xs",
        est === "actual" ? "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30" : "border-border bg-secondary/40",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">{e.etiqueta}</p>
          <p className="text-muted-foreground">
            Le toca a <strong className="text-foreground">{ETIQUETA_AREA[e.area]}</strong>
            {" · "}
            {est === "hecho"
              ? `hecho${e.cuando ? ` el ${fechaHoraLima(e.cuando)}` : ""}${e.quien ? ` por ${e.quien}` : ""}`
              : est === "no_aplica"
                ? e.noAplica
                : est === "actual"
                  ? `aquí está atascado${r.desde ? ` desde el ${fechaHoraLima(r.desde)} (${haceCuanto(r.desde)})` : ""}`
                  : "todavía no llega aquí"}
          </p>
          {e.trabado && <p className="font-medium text-red-800 dark:text-red-300">Qué lo traba: {e.trabado}</p>}
          {e.alerta && <p className="font-medium text-amber-800 dark:text-amber-300">{e.alerta}</p>}
          {e.detalle && <p className="text-muted-foreground">{e.detalle}</p>}
          {est === "actual" && e.area === "cliente" && <p className="text-muted-foreground">Le toca al cliente: llámelo o escríbale desde la ficha.</p>}
          {est === "actual" && apuro && (
            <p className="text-muted-foreground">
              Último apuro: {fechaHoraLima(apuro.at)}
              {apuro.quien ? ` por ${apuro.quien}` : ""} · {apuro.n} {apuro.n === 1 ? "vez" : "veces"}
            </p>
          )}
        </div>
        {est === "actual" && area && (
          <Button type="button" size="sm" variant="destructive" onClick={apurar} disabled={pendiente} className="shrink-0">
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
            Apurar a {AREA_CORTA[e.area === "tecnico" ? "postventa" : e.area]}
          </Button>
        )}
      </div>
    </div>
  );
}
