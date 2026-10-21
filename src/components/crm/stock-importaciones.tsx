"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleSlash, FileSpreadsheet, Search, Sparkles, Upload, Wand2 } from "lucide-react";
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
 */

const ESTADOS: Record<EstadoFila, { etiqueta: string; ayuda: string; clase: string; punto: string }> = {
  revisar: {
    etiqueta: "Revisar",
    ayuda: "Código equivocado, serie que ya está con un cliente o modelo que no cuadra",
    clase: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
    punto: "bg-red-500",
  },
  elegir: {
    etiqueta: "Elegir",
    ayuda: "Calzan varios códigos: elija uno",
    clase: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
    punto: "bg-amber-500",
  },
  nuevo: {
    etiqueta: "Código nuevo",
    ayuda: "No existe en el CRM: va un código tentativo. Si le gusta, queda",
    clase: "border-orange-300 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30",
    punto: "bg-orange-500",
  },
  sugerido: {
    etiqueta: "Sugerido",
    ayuda: "No tenía código y el CRM encontró uno con la misma configuración",
    clase: "border-sky-300 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30",
    punto: "bg-sky-500",
  },
  ok: {
    etiqueta: "OK",
    ayuda: "El código que puso Lesly está bien",
    clase: "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30",
    punto: "bg-emerald-500",
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

// ------------------------------------------------------------------ subir el Excel

export function SubirExcelStock({ hayCarga }: { hayCarga: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-4"
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
      <FileSpreadsheet className="size-6 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{hayCarga ? "Subir otro Excel (reemplaza la revisión de abajo)" : "Suba el Excel de stock de Importaciones"}</p>
        <p className="text-xs text-muted-foreground">
          Se leen solo las hojas de STOCK (industriales y LG). Reserva y vendidos no se suben. La columna COSTO no se lee: los costos no
          entran al CRM.
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
        <span className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm hover:bg-muted">
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

export function RevisarStock({ carga }: { carga: CargaStock }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<EstadoFila | "todos" | "pendientes">("pendientes");
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">
          {carga.archivo} · {carga.filas.length} máquinas · hojas: {carga.hojas.join(", ")}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <BotonFiltro activo={filtro === "pendientes"} onClick={() => setFiltro("pendientes")}>
          Por decidir · {cuenta.pendiente}
        </BotonFiltro>
        {ORDEN.map((e) =>
          porEstado[e] ? (
            <BotonFiltro key={e} activo={filtro === e} onClick={() => setFiltro(e)} title={ESTADOS[e].ayuda}>
              <span className={cn("size-2 rounded-full", ESTADOS[e].punto)} /> {ESTADOS[e].etiqueta} · {porEstado[e]}
            </BotonFiltro>
          ) : null,
        )}
        <BotonFiltro activo={filtro === "todos"} onClick={() => setFiltro("todos")}>
          Todas · {carga.filas.length}
        </BotonFiltro>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Serie, modelo o código" className="pl-8" />
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          {filtro === "pendientes"
            ? "No queda nada por decidir. Revise el resumen de abajo y suba al almacén."
            : "Nada con ese filtro."}
        </p>
      ) : (
        <div className="space-y-2">
          {visibles.map((g) => (
            <TarjetaGrupo key={g.clave} cargaId={carga.id} grupo={g} />
          ))}
        </div>
      )}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
        <p className="text-sm">
          <b>{cuenta.subir}</b> para subir · <b>{cuenta.pendiente}</b> sin decidir · <b>{cuenta.no_subir}</b> no se suben
        </p>
        {cuenta.pendiente > 0 && (
          <p className="text-xs text-muted-foreground">Las que queden sin decidir no se suben; puede volver a esta pantalla cuando quiera.</p>
        )}
        <Button className="ml-auto" disabled={cuenta.subir === 0 || pendiente} onClick={() => setConfirmar(true)}>
          <Upload className="size-4" /> Subir al almacén
        </Button>
      </div>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir {cuenta.subir} máquinas al almacén</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>Cada máquina entra con su serie y queda «disponible». Desde ese momento es el stock que ven las comerciales y el cotizador.</p>
            <p className="text-muted-foreground">
              Los códigos nuevos se crean en el catálogo como «en preparación» (no se cotizan hasta que les ponga la ficha y los active).
              Sin costos.
            </p>
            {carga.ausentes.length > 0 && (
              <label className="flex items-start gap-2 rounded-md border border-border p-2">
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

function BotonFiltro({ activo, children, ...props }: React.ComponentProps<"button"> & { activo: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
        activo ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function TarjetaGrupo({ cargaId, grupo }: { cargaId: string; grupo: Grupo }) {
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

  function decidir(d: FilaCarga["decision"]) {
    iniciar(async () => {
      const r = await decidirStock(cargaId, grupo.indices, d, d === "subir" ? codigo : codigo || null);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <div className={cn("rounded-lg border p-3", estilo.clase)}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("size-2 rounded-full", estilo.punto)} />
            <span className="text-xs font-semibold uppercase tracking-wide">{estilo.etiqueta}</span>
            <span className="text-sm font-medium">
              {cantidad} × {f0.modelo}
            </span>
            <span className="text-xs text-muted-foreground">· hoja {/LG/i.test(f0.hoja) ? "LG" : "industriales"}</span>
            {f0.codigoExcel && <span className="text-xs text-muted-foreground">· en el Excel: {f0.codigoExcel}</span>}
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground" title={f0.descripcion}>
            {f0.descripcion}
          </p>
          <p className="text-sm">{f0.motivo}</p>
          {f0.candidatos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              En el CRM:{" "}
              {f0.candidatos.map((c, i) => (
                <span key={c.sku}>
                  {i > 0 && " · "}
                  <button type="button" className="font-mono underline-offset-2 hover:underline" onClick={() => setCodigo(c.sku)}>
                    {c.sku}
                  </button>
                  {!c.activo && " (retirado)"}
                  {c.choques.length > 0 && <span title={c.choques.join("; ")}> ≠ {c.choques.map((x) => x.split(":")[0]).join(", ")}</span>}
                </span>
              ))}
            </p>
          )}
          <button type="button" className="text-xs underline underline-offset-2" onClick={() => setVerSeries((v) => !v)}>
            {verSeries ? "Ocultar series" : `Ver series (${grupo.filas.length})`}
          </button>
          {verSeries && (
            <p className="font-mono text-xs leading-relaxed">
              {grupo.filas.map((f) => `${f.serie ?? `sin serie ×${f.cantidad}`} (fila ${f.fila}${f.item ? `, ${f.item}` : ""})`).join(" · ")}
            </p>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-64">
          <label className="text-xs text-muted-foreground">
            Código
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/\s/g, ""))}
              list={listaId}
              placeholder="Elija o escriba"
              className="mt-1 font-mono"
            />
            <datalist id={listaId}>
              {f0.candidatos.map((c) => (
                <option key={c.sku} value={c.sku} />
              ))}
            </datalist>
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              variant={decision === "subir" ? "default" : "outline"}
              disabled={pendiente || !codigo}
              onClick={() => decidir("subir")}
            >
              <CheckCircle2 className="size-4" /> {decision === "subir" && codigo === f0.codigoFinal ? "Va a subir" : "Subir así"}
            </Button>
            <Button
              size="sm"
              variant={decision === "no_subir" ? "default" : "outline"}
              disabled={pendiente}
              onClick={() => decidir("no_subir")}
              title="No se sube como stock libre"
            >
              <CircleSlash className="size-4" /> No subir
            </Button>
          </div>
          {decision === "mixta" && <p className="text-xs text-muted-foreground">Hay decisiones distintas dentro del grupo.</p>}
        </div>
      </div>
    </div>
  );
}

export function ResumenSubida({ resultado }: { resultado: ResultadoSubida }) {
  return (
    <div className="space-y-1 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
      <p className="font-medium">
        Entraron {resultado.cargadas} máquinas al almacén
        {resultado.movidas > 0 && `, ${resultado.movidas} cambiaron de código`}
        {resultado.iguales > 0 && `, ${resultado.iguales} ya estaban`}.
      </p>
      {resultado.referencia > 0 && <p>{resultado.referencia} códigos sin serie (coches, accesorios) quedaron con su stock de referencia.</p>}
      {resultado.creados.length > 0 && (
        <p>
          Códigos nuevos creados en preparación: <b className="font-mono">{resultado.creados.join(", ")}</b>. Póngales ficha y actívelos en
          el catálogo para que se puedan cotizar.
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
  rasgos: string;
  enAlmacen: number;
}

export function ListaCodigos({ codigos }: { codigos: CodigoCatalogo[] }) {
  const [texto, setTexto] = useState("");
  const [verRetirados, setVerRetirados] = useState(false);
  const lista = codigos.filter((c) => {
    if (!verRetirados && !c.activo) return false;
    const t = texto.trim().toUpperCase();
    return !t || [c.sku, c.nombre, c.modelo, c.rasgos].some((v) => v.toUpperCase().includes(t));
  });
  return (
    <div className="space-y-3">
      <GeneradorCodigo />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, modelo, GLP, Unilinc…" className="pl-8" />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={verRetirados} onChange={(e) => setVerRetirados(e.target.checked)} /> Ver también los retirados
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{lista.length} códigos</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
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
              <tr key={c.sku} className={cn("border-t border-border", !c.activo && "text-muted-foreground")}>
                <td className="px-3 py-1.5 font-mono">
                  {c.sku}
                  {!c.activo && <span className="ml-1 text-xs">(retirado)</span>}
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
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2">
        <Wand2 className="size-4 text-[#8B1510]" />
        <p className="text-sm font-medium">Código para un equipo que llega</p>
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
          <Sparkles className="size-4" /> {pendiente ? "Buscando…" : "Buscar código"}
        </Button>
      </div>
      {sug && (
        <div className="space-y-1 text-sm">
          <p className="text-xs text-muted-foreground">
            Leí:{" "}
            {Object.entries(sug.rasgos)
              .map(([k, v]) => `${k} ${v}`)
              .join(" · ") || "nada reconocible — escriba el modelo"}
          </p>
          {sug.iguales.length > 0 ? (
            <p>
              <b>Ya existe:</b>{" "}
              {sug.iguales.map((c) => (
                <span key={c.sku} className="mr-2 font-mono">
                  {c.sku}
                  {!c.activo && " (retirado)"}
                </span>
              ))}
              — use ese código, no cree otro.
            </p>
          ) : (
            <p>
              No hay ningún código con esa configuración. Código tentativo: <b className="font-mono">{sug.tentativo}</b>
            </p>
          )}
          {sug.parecidos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Parecidos pero distintos:{" "}
              {sug.parecidos.map((c) => `${c.sku} (${c.diferencias.join("; ")})`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
