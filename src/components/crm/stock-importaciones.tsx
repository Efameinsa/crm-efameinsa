"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  FileSpreadsheet,
  ListChecks,
  Search,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import {
  analizarExcelStock,
  decidirStock,
  subirStock,
  sugerirCodigo,
  type CargaStock,
  type FilaCarga,
  type ResultadoSubida,
  type SugerenciaCodigo,
} from "@/lib/acciones/stock-importaciones";
import type { EstadoFila } from "@/lib/stock-importaciones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * SUBIR EL STOCK DE IMPORTACIONES (0576, Lesly y el ing. 21-10).
 *
 * Se revisa por GRUPOS, no máquina por máquina: veintisiete Giant C Max
 * iguales con el mismo problema son una sola decisión. El grupo junta las
 * máquinas de la misma hoja con el mismo código, el mismo modelo y el mismo
 * motivo; una serie que ya está con un cliente cae sola en su propio grupo
 * porque su motivo nombra al cliente.
 *
 * NUEVO O YA EXISTE, A SIMPLE VISTA (Santos, 21-10: «debe poder distinguirse
 * los códigos nuevos que se están subiendo de los antiguos… una señal ligera,
 * tenue»). La casilla del código se mira contra el catálogo mientras se
 * escribe: un código que ya existe va sobrio; uno que se va a CREAR lleva un
 * borde punteado ámbar y la leyenda «Código nuevo · se crea». Y «Sugerido»
 * pasó a llamarse «Ya existe — faltaba ponerlo»: Santos leyó «sugerido» como
 * «código inventado» cuando era uno del catálogo.
 */

const ESTADOS: Record<EstadoFila, { etiqueta: string; ayuda: string; franja: string; pastilla: string }> = {
  revisar: {
    etiqueta: "Revisar",
    ayuda: "Hay un problema: código equivocado, una serie que el CRM ya tiene con un cliente o un modelo que no cuadra con su descripción.",
    franja: "border-l-red-400",
    pastilla: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  },
  elegir: {
    etiqueta: "Elegir entre códigos",
    ayuda: "Calzan varios códigos que ya existen. Toque el que corresponde.",
    franja: "border-l-amber-400",
    pastilla: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  nuevo: {
    etiqueta: "Código nuevo",
    ayuda: "Esa configuración no existe en el catálogo: se propone un código que se CREA al subir. Si le gusta, queda; si no, escriba otro.",
    franja: "border-l-orange-300",
    pastilla: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  },
  sugerido: {
    etiqueta: "Ya existe — faltaba ponerlo",
    ayuda: "En el Excel no tenía código, pero en el catálogo ya hay uno con la misma configuración. No se crea nada: se usa ese.",
    franja: "border-l-sky-300",
    pastilla: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  },
  ok: {
    etiqueta: "Código correcto",
    ayuda: "El código que ya tenía en el Excel está bien.",
    franja: "border-l-emerald-300",
    pastilla: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  },
};
const ORDEN: EstadoFila[] = ["revisar", "elegir", "nuevo", "sugerido", "ok"];

interface Grupo {
  clave: string;
  estado: EstadoFila;
  indices: number[];
  filas: FilaCarga[];
}

// Aquí y no importado de lib/stock-importaciones: ese archivo trae la librería de Excel, que no va al navegador.
const claveGrupo = (p: FilaCarga) => [p.hoja, p.estado, p.codigoExcel ?? "", p.codigo ?? "", p.modelo, p.motivo].join("|");

function agrupar(filas: FilaCarga[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  filas.forEach((f, i) => {
    const clave = claveGrupo(f);
    const g = mapa.get(clave) ?? { clave, estado: f.estado, indices: [], filas: [] };
    g.indices.push(i);
    g.filas.push(f);
    mapa.set(clave, g);
  });
  return [...mapa.values()].sort((a, b) => ORDEN.indexOf(a.estado) - ORDEN.indexOf(b.estado) || a.filas[0].fila - b.filas[0].fila);
}

/** «Revisar» dice CUÁL es el problema (Santos 21-10: «pones revisar pero no dices qué problema es»). */
function problemaCorto(motivo: string): string {
  if (/ya está en el CRM con/.test(motivo)) return "Serie ya vendida o reservada";
  if (/tipo de equipo: Excel lavadora/.test(motivo)) return "Es lavadora con código de secadora";
  if (/tipo de equipo: Excel secadora/.test(motivo)) return "Es secadora con código de lavadora";
  if (/MODELO dice/.test(motivo)) return "Modelo y descripción no coinciden";
  if (/no existe en el CRM/.test(motivo)) return "Ese código no existe";
  if (/calentamiento:/.test(motivo)) return "El tipo de gas no coincide";
  if (/voltaje:/.test(motivo)) return "El voltaje no coincide";
  if (/control:/.test(motivo)) return "El control no coincide";
  if (/retirado/.test(motivo)) return "Código retirado";
  return "Revisar";
}

/** Los códigos del catálogo: si existe y si está activo. */
export type CodigosExistentes = Record<string, { activo: boolean }>;

/** La señal tenue: código que ya existe (sobrio) o que se va a crear (punteado ámbar). */
function SenalCodigo({ codigo, existentes }: { codigo: string; existentes: CodigosExistentes }) {
  if (!codigo) return <span className="text-[11px] text-muted-foreground">Elija uno de los parecidos o escriba el código</span>;
  const e = existentes[codigo];
  if (e)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CheckCircle2 className="size-3" /> Ya existe en el catálogo{!e.activo && " (retirado: actívelo después)"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-orange-700 dark:text-orange-300">
      <Sparkles className="size-3" /> Código nuevo · se crea en preparación al subir
    </span>
  );
}

// ------------------------------------------------------------------ subir el Excel

export function SubirExcelStock({ hayCarga }: { hayCarga: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState<string | null>(null);

  return (
    <form
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4",
        hayCarga ? "border-border" : "border-[#8B1510]/40 bg-[#8B1510]/[0.03] py-8",
      )}
      action={(fd) =>
        iniciar(async () => {
          const r = await analizarExcelStock(fd);
          if (r.error) toast.error(r.error);
          else {
            toast.success("Excel leído. Revise la propuesta");
            router.refresh();
          }
        })
      }
    >
      <FileSpreadsheet className={cn("text-muted-foreground", hayCarga ? "size-6" : "size-9")} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{hayCarga ? "¿Llegó un Excel más nuevo? Súbalo aquí (reemplaza la revisión de abajo)" : "Suba el Excel de stock de Importaciones"}</p>
        <p className="text-xs text-muted-foreground">
          Tal como viene. Se leen solo las hojas de STOCK (industriales y LG); reserva y vendidos no. Los costos no se leen ni se suben.
        </p>
      </div>
      <label className="cursor-pointer">
        <input
          type="file"
          name="archivo"
          accept=".xlsx,.xls"
          className="sr-only"
          onChange={(e) => setNombre(e.target.files?.[0]?.name ?? null)}
          required
        />
        <span className="inline-flex h-9 max-w-64 items-center truncate rounded-md border border-border bg-background px-3 text-sm hover:bg-muted">
          {nombre ?? "Elegir archivo…"}
        </span>
      </label>
      <Button type="submit" disabled={pendiente || !nombre}>
        <Upload className="size-4" />
        {pendiente ? "Leyendo y comparando…" : "Leer y comparar"}
      </Button>
    </form>
  );
}

// ------------------------------------------------------------------ revisar

type Filtro = EstadoFila | "todos" | "pendientes";

export function RevisarStock({ carga, existentes }: { carga: CargaStock; existentes: CodigosExistentes }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [texto, setTexto] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [sacarAusentes, setSacarAusentes] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSubida | null>(null);
  const [pendiente, iniciar] = useTransition();

  const grupos = useMemo(() => agrupar(carga.filas), [carga.filas]);
  const cuenta = useMemo(() => {
    const c = { subir: 0, no_subir: 0, pendiente: 0 } as Record<FilaCarga["decision"], number>;
    carga.filas.forEach((f) => c[f.decision]++);
    return c;
  }, [carga.filas]);
  const porEstado = useMemo(() => {
    const c = {} as Record<EstadoFila, number>;
    carga.filas.forEach((f) => (c[f.estado] = (c[f.estado] ?? 0) + 1));
    return c;
  }, [carga.filas]);
  // Cuántos códigos se van a CREAR con lo decidido hasta ahora.
  const codigosNuevos = useMemo(
    () => [...new Set(carga.filas.filter((f) => f.decision === "subir" && f.codigoFinal && !existentes[f.codigoFinal]).map((f) => f.codigoFinal!))],
    [carga.filas, existentes],
  );

  const total = carga.filas.length;
  const decididas = total - cuenta.pendiente;
  const visibles = grupos.filter((g) => {
    if (filtro === "pendientes" && !g.filas.some((f) => f.decision === "pendiente")) return false;
    if (filtro !== "todos" && filtro !== "pendientes" && g.estado !== filtro) return false;
    if (!texto.trim()) return true;
    const t = texto.trim().toUpperCase();
    return g.filas.some((f) => [f.serie, f.modelo, f.codigoExcel, f.codigoFinal, f.item, f.descripcion].some((v) => v?.toUpperCase().includes(t)));
  });

  function subir() {
    iniciar(async () => {
      const r = await subirStock(carga.id, sacarAusentes);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setConfirmar(false);
      setResultado(r.resultado ?? null);
      toast.success(`Listo: ${r.resultado?.cargadas ?? 0} máquinas entraron al almacén`);
      router.refresh();
    });
  }

  const ayudaFiltro =
    filtro === "pendientes"
      ? "Lo que todavía no decidió. Lo que el CRM confirmó o encontró sin dudas ya viene marcado para subir."
      : filtro === "todos"
        ? "Todas las máquinas del Excel, agrupadas."
        : ESTADOS[filtro].ayuda;

  return (
    <div className="space-y-4">
      {/* Cuánto falta */}
      <div className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm">
            <span className="font-medium">{carga.archivo}</span>
            <span className="text-muted-foreground"> · {total} máquinas</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {cuenta.pendiente === 0 ? "Todo decidido" : `${decididas} de ${total} decididas`}
          </p>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
          <div className="bg-emerald-400" style={{ width: `${(cuenta.subir / total) * 100}%` }} title={`${cuenta.subir} van a subir`} />
          <div className="bg-zinc-300 dark:bg-zinc-600" style={{ width: `${(cuenta.no_subir / total) * 100}%` }} title={`${cuenta.no_subir} no se suben`} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-400" /> {cuenta.subir} van a subir</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground/30" /> {cuenta.pendiente} sin decidir</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-zinc-300 dark:bg-zinc-600" /> {cuenta.no_subir} no se suben</span>
          {codigosNuevos.length > 0 && (
            <span className="inline-flex items-center gap-1 text-orange-700 dark:text-orange-300">
              <Sparkles className="size-3" /> {codigosNuevos.length} códigos nuevos se van a crear
            </span>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Pastilla activo={filtro === "pendientes"} onClick={() => setFiltro("pendientes")}>
            <ListChecks className="size-3.5" /> Por decidir <b>{cuenta.pendiente}</b>
          </Pastilla>
          {ORDEN.map((e) =>
            porEstado[e] ? (
              <Pastilla key={e} activo={filtro === e} onClick={() => setFiltro(e)}>
                <span className={cn("rounded px-1.5 py-px text-[11px]", ESTADOS[e].pastilla)}>{ESTADOS[e].etiqueta}</span> <b>{porEstado[e]}</b>
              </Pastilla>
            ) : null,
          )}
          <Pastilla activo={filtro === "todos"} onClick={() => setFiltro("todos")}>
            Todas <b>{total}</b>
          </Pastilla>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-xs text-muted-foreground">{ayudaFiltro}</p>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar serie, modelo o código" className="pl-8" />
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>Cómo leer el código:</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded border border-border bg-background px-1.5 font-mono">LAVW23</span> ya existe en el catálogo
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded border border-dashed border-orange-300 bg-orange-50/60 px-1.5 font-mono text-orange-800 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
              SECUS30
            </span>
            código nuevo, se crea al subir
          </span>
        </p>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-xl border border-border p-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 size-6 text-emerald-500" />
          <p className="text-sm">{filtro === "pendientes" ? "No queda nada por decidir." : "Nada con ese filtro."}</p>
          {filtro === "pendientes" && <p className="text-xs text-muted-foreground">Revise el resumen de abajo y pulse «Subir al almacén».</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map((g) => (
            <TarjetaGrupo key={g.clave} cargaId={carga.id} grupo={g} existentes={existentes} />
          ))}
        </div>
      )}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
        <p className="text-sm">
          <b>{cuenta.subir}</b> van a subir{cuenta.pendiente > 0 && <> · <b>{cuenta.pendiente}</b> sin decidir</>}
          {codigosNuevos.length > 0 && <span className="text-orange-700 dark:text-orange-300"> · {codigosNuevos.length} códigos nuevos</span>}
        </p>
        {cuenta.pendiente > 0 && <p className="text-xs text-muted-foreground">Lo que quede sin decidir no se sube. Puede volver cuando quiera.</p>}
        <Button className="ml-auto" disabled={cuenta.subir === 0 || pendiente} onClick={() => setConfirmar(true)}>
          <Upload className="size-4" /> Subir al almacén
        </Button>
      </div>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir {cuenta.subir} máquinas al almacén</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Cada máquina entra con su serie como disponible. Desde ese momento es el stock que ven las comerciales y el cotizador. Sin costos.</p>
            {codigosNuevos.length > 0 && (
              <div className="rounded-lg border border-dashed border-orange-300 bg-orange-50/50 p-3 dark:border-orange-800 dark:bg-orange-950/20">
                <p className="flex items-center gap-1.5 font-medium text-orange-800 dark:text-orange-200">
                  <Sparkles className="size-4" /> Se crean {codigosNuevos.length} códigos nuevos
                </p>
                <p className="mt-1 font-mono text-xs">{codigosNuevos.join(" · ")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Quedan «en preparación»: no se cotizan hasta que les ponga la ficha y los active en el catálogo.
                </p>
              </div>
            )}
            {cuenta.pendiente > 0 && <p className="text-muted-foreground">{cuenta.pendiente} máquinas sin decidir no se suben.</p>}
            {carga.ausentes.length > 0 && (
              <label className="flex items-start gap-2 rounded-lg border border-border p-3">
                <input type="checkbox" checked={sacarAusentes} onChange={(e) => setSacarAusentes(e.target.checked)} className="mt-1" />
                <span>
                  {carga.ausentes.length} máquinas están disponibles en el almacén y ya no vienen en este Excel (
                  {carga.ausentes.slice(0, 5).map((a) => a.serie).join(", ")}
                  {carga.ausentes.length > 5 ? "…" : ""}). Marcarlas como salidas.
                </span>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(false)}>
              Volver
            </Button>
            <Button onClick={subir} disabled={pendiente}>
              {pendiente ? "Subiendo…" : "Sí, subir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {resultado && <ResumenSubida resultado={resultado} />}
    </div>
  );
}

function Pastilla({ activo, children, ...props }: React.ComponentProps<"button"> & { activo: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        activo ? "border-foreground/70 bg-foreground/[0.06] font-medium" : "border-border text-muted-foreground hover:bg-muted",
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function TarjetaGrupo({ cargaId, grupo, existentes }: { cargaId: string; grupo: Grupo; existentes: CodigosExistentes }) {
  const router = useRouter();
  const f0 = grupo.filas[0];
  const [codigo, setCodigo] = useState(f0.codigoFinal ?? "");
  const [verSeries, setVerSeries] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const decisiones = new Set(grupo.filas.map((f) => f.decision));
  const decision = decisiones.size === 1 ? f0.decision : "mixta";
  const estilo = ESTADOS[grupo.estado];
  const listaId = `cand-${grupo.indices[0]}`;
  const cantidad = grupo.filas.reduce((s, f) => s + (f.serie ? 1 : f.cantidad), 0);
  const esNuevo = !!codigo && !existentes[codigo];
  const cambiado = codigo !== (f0.codigoFinal ?? "");

  function decidir(d: FilaCarga["decision"]) {
    iniciar(async () => {
      const r = await decidirStock(cargaId, grupo.indices, d, codigo || null);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-l-4 border-border bg-card p-4 transition-opacity",
        estilo.franja,
        decision === "no_subir" && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", estilo.pastilla)}>
              {grupo.estado === "revisar" ? `Revisar · ${problemaCorto(f0.motivo)}` : estilo.etiqueta}
            </span>
            <span className="text-sm font-semibold">
              {cantidad} {cantidad === 1 ? "máquina" : "máquinas"} · {f0.modelo}
            </span>
            <span className="text-xs text-muted-foreground">
              hoja {/LG/i.test(f0.hoja) ? "LG" : "industriales"}
              {f0.codigoExcel ? ` · en el Excel: ${f0.codigoExcel}` : " · sin código en el Excel"}
            </span>
          </div>
          <p className="line-clamp-1 text-xs text-muted-foreground" title={f0.descripcion}>
            {f0.descripcion}
          </p>
          <p className="flex items-start gap-1.5 text-sm">
            {grupo.estado === "revisar" && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" />}
            <span>{f0.motivo}</span>
          </p>
          {f0.candidatos.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px] text-muted-foreground">Parecidos en el catálogo:</span>
              {f0.candidatos.map((c) => (
                <button
                  key={c.sku}
                  type="button"
                  onClick={() => setCodigo(c.sku)}
                  title={c.choques.length ? `Difiere en ${c.choques.join("; ")}` : "Misma configuración"}
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted",
                    codigo === c.sku ? "border-foreground/60 bg-foreground/[0.06]" : "border-border",
                    c.choques.length > 0 && "text-muted-foreground",
                  )}
                >
                  {c.sku}
                  {!c.activo && " · retirado"}
                  {c.choques.length > 0 && <span className="ml-1">≠ {c.choques.map((x) => x.split(":")[0]).join(", ")}</span>}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setVerSeries((v) => !v)}>
            <ChevronDown className={cn("size-3 transition-transform", verSeries && "rotate-180")} />
            {verSeries ? "Ocultar series" : `Ver ${grupo.filas.length === 1 ? "la serie" : `las ${grupo.filas.length} series`}`}
          </button>
          {verSeries && (
            <p className="rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed">
              {grupo.filas.map((f) => `${f.serie ?? `sin serie de placa ×${f.cantidad}`} (fila ${f.fila}${f.item ? `, ${f.item}` : ""})`).join(" · ")}
            </p>
          )}
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-64">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Código a usar</span>
            {decision === "subir" && !cambiado && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" /> Va a subir
              </span>
            )}
            {decision === "no_subir" && <span className="text-[11px] text-muted-foreground">No se sube</span>}
            {decision === "pendiente" && <span className="text-[11px] text-amber-700 dark:text-amber-300">Sin decidir</span>}
            {decision === "mixta" && <span className="text-[11px] text-muted-foreground">Decisiones distintas</span>}
          </div>
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/\s/g, ""))}
            list={listaId}
            placeholder="Elija o escriba"
            className={cn("font-mono", esNuevo && "border-dashed border-orange-300 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/20")}
          />
          <datalist id={listaId}>
            {f0.candidatos.map((c) => (
              <option key={c.sku} value={c.sku} />
            ))}
          </datalist>
          <SenalCodigo codigo={codigo} existentes={existentes} />
          <div className="mt-1 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              variant={decision === "subir" && !cambiado ? "secondary" : "default"}
              disabled={pendiente || !codigo || (decision === "subir" && !cambiado)}
              onClick={() => decidir("subir")}
            >
              <CheckCircle2 className="size-4" /> {codigo ? `Subir con ${codigo}` : "Subir"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pendiente || decision === "no_subir"}
              onClick={() => decidir("no_subir")}
              title="No se sube como stock libre"
            >
              <CircleSlash className="size-4" /> No subir
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ResumenSubida({ resultado }: { resultado: ResultadoSubida }) {
  return (
    <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
      <p className="flex items-center gap-1.5 font-medium">
        <CheckCircle2 className="size-4 text-emerald-600" />
        Entraron {resultado.cargadas} máquinas al almacén
        {resultado.movidas > 0 && `, ${resultado.movidas} cambiaron de código`}
        {resultado.iguales > 0 && `, ${resultado.iguales} ya estaban`}.
      </p>
      {resultado.referencia > 0 && <p>{resultado.referencia} códigos sin serie (coches, accesorios) quedaron con su stock de referencia.</p>}
      {resultado.creados.length > 0 && (
        <p>
          <Sparkles className="mr-1 inline size-3.5 text-orange-600" />
          Códigos nuevos creados en preparación: <b className="font-mono">{resultado.creados.join(", ")}</b>. Póngales ficha y actívelos en el
          catálogo para que se puedan cotizar.
        </p>
      )}
      {resultado.retirados.length > 0 && (
        <p>
          Máquinas en códigos retirados: <b className="font-mono">{resultado.retirados.join(", ")}</b>. Las comerciales no las ven hasta que
          active el código.
        </p>
      )}
      {resultado.ocupadas.length > 0 && <p>No se tocaron porque ya estaban reservadas o despachadas: {resultado.ocupadas.join(", ")}.</p>}
      {resultado.sacadas > 0 && <p>{resultado.sacadas} máquinas que ya no venían en el Excel quedaron como salidas.</p>}
      {resultado.sinDecidir > 0 && <p>{resultado.sinDecidir} quedaron sin decidir y no se subieron.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ códigos

export interface CodigoCatalogo {
  sku: string;
  nombre: string;
  modelo: string;
  activo: boolean;
  enPreparacion: boolean;
  rasgos: string;
  enAlmacen: number;
}

export function ListaCodigos({ codigos }: { codigos: CodigoCatalogo[] }) {
  const [texto, setTexto] = useState("");
  const [verRetirados, setVerRetirados] = useState(false);
  const nuevos = codigos.filter((c) => c.enPreparacion).length;
  const lista = codigos
    .filter((c) => {
      if (!verRetirados && !c.activo && !c.enPreparacion) return false;
      const t = texto.trim().toUpperCase();
      return !t || [c.sku, c.nombre, c.modelo, c.rasgos].some((v) => v.toUpperCase().includes(t));
    })
    // Los nuevos (en preparación) arriba: son los que piden trabajo.
    .sort((a, b) => Number(b.enPreparacion) - Number(a.enPreparacion) || a.sku.localeCompare(b.sku));
  return (
    <div className="space-y-4">
      <GeneradorCodigo />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, modelo, GLP, Unilinc…" className="pl-8" />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={verRetirados} onChange={(e) => setVerRetirados(e.target.checked)} /> Ver también los retirados
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {lista.length} códigos
          {nuevos > 0 && <span className="text-orange-700 dark:text-orange-300"> · {nuevos} nuevos en preparación</span>}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Modelo</th>
              <th className="px-3 py-2">Configuración</th>
              <th className="px-3 py-2 text-right">En almacén</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr
                key={c.sku}
                className={cn(
                  "border-t border-border",
                  c.enPreparacion && "bg-orange-50/40 dark:bg-orange-950/10",
                  !c.activo && !c.enPreparacion && "text-muted-foreground",
                )}
              >
                <td className="px-3 py-1.5">
                  <span
                    className={cn(
                      "font-mono",
                      c.enPreparacion && "rounded border border-dashed border-orange-300 px-1 text-orange-800 dark:border-orange-800 dark:text-orange-200",
                    )}
                  >
                    {c.sku}
                  </span>
                  {c.enPreparacion && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-orange-700 dark:text-orange-300">
                      <Sparkles className="size-3" /> nuevo · falta ficha y activarlo
                    </span>
                  )}
                  {!c.activo && !c.enPreparacion && <span className="ml-1 text-xs">(retirado)</span>}
                </td>
                <td className="px-3 py-1.5">
                  <span className="block">{c.modelo}</span>
                  <span className="block text-xs text-muted-foreground">{c.nombre}</span>
                </td>
                <td className="px-3 py-1.5 text-xs">{c.rasgos || "—"}</td>
                <td className="px-3 py-1.5 text-right">{c.enAlmacen || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GeneradorCodigo() {
  const [modelo, setModelo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [sug, setSug] = useState<SugerenciaCodigo | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <Wand2 className="size-4 text-[#8B1510]" />
        <p className="text-sm font-medium">¿Qué código le toca a un equipo que llega?</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Pegue la descripción como viene de Importaciones. Si ya hay un código con esa misma configuración se lo digo (para no duplicar); si no,
        le propongo el siguiente libre.
      </p>
      <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
        <Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Modelo (UT075)" />
        <Textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          placeholder="SECADORA INDUSTRIAL, MOD. UT075, CONTROL: UNILINC TOUCH, CILINDRO INOXIDABLE, GAS GLP, X(220V/60HZ/1-3PH)"
        />
        <Button
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await sugerirCodigo(modelo, descripcion);
              if (r.error) toast.error(r.error);
              setSug(r.sugerencia ?? null);
            })
          }
        >
          <Search className="size-4" /> {pendiente ? "Buscando…" : "Buscar código"}
        </Button>
      </div>
      {sug && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Leí:{" "}
            {Object.entries(sug.rasgos)
              .map(([k, v]) => `${k} ${v}`)
              .join(" · ") || "nada reconocible — escriba el modelo"}
          </p>
          {sug.iguales.length > 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
              <p className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" /> <b>Ya existe:</b>
                {sug.iguales.map((c) => (
                  <span key={c.sku} className="rounded border border-border bg-background px-1.5 font-mono">
                    {c.sku}
                    {!c.activo && " · retirado"}
                  </span>
                ))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Use ese código; no cree otro.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-orange-300 bg-orange-50/50 p-3 text-sm dark:border-orange-800 dark:bg-orange-950/20">
              <p className="flex items-center gap-1.5">
                <Sparkles className="size-4 text-orange-600" /> No hay ningún código con esa configuración. Código nuevo:{" "}
                <b className="font-mono">{sug.tentativo}</b>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">No repite ningún código, ni los retirados.</p>
            </div>
          )}
          {sug.parecidos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Parecidos pero distintos: {sug.parecidos.map((c) => `${c.sku} (${c.diferencias.join("; ")})`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
