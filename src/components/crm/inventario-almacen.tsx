"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, Package, Search } from "lucide-react";
import { buscarEquipos } from "@/lib/buscar-equipo";
import { cargarSeries, moverEquipo } from "@/lib/acciones/inventario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * El almacén: cuántas máquinas hay de cada modelo y cuáles son.
 *
 * DOS NIVELES, PORQUE SON DOS PREGUNTAS DISTINTAS. «¿Tengo lavadoras RX135?» se
 * contesta con un número y se pregunta veinte veces al día —es la que hace el
 * comercial antes de prometer una entrega—. «¿Cuáles son y dónde están?» se
 * pregunta cuando hay que despachar una, y necesita las series. Por eso el
 * modelo muestra el número y se abre para ver las máquinas.
 */

export interface ModeloStock {
  productoId: string;
  sku: string | null;
  marca: string;
  modelo: string;
  nombre: string;
  capacidad: string | null;
  categoria: string | null;
  segmento: "industrial" | "semi_industrial";
  calentamiento: string | null;
  montaje: string | null;
  disponibles: number;
  reservados: number;
  despachados: number;
  maquinas: {
    id: string;
    serie: string;
    estado: "disponible" | "reservado" | "despachado" | "baja";
    ubicacion: string | null;
    ingresoAt: string;
    reservadoPara: string | null;
  }[];
}

const ETIQUETA_ESTADO: Record<string, string> = {
  disponible: "Disponible",
  reservado: "Reservada",
  despachado: "Despachada",
  baja: "De baja",
};

export function InventarioAlmacen({ modelos }: { modelos: ModeloStock[] }) {
  const [texto, setTexto] = useState("");
  const [soloConStock, setSoloConStock] = useState(false);

  const resultados = useMemo(() => {
    const lista = soloConStock ? modelos.filter((m) => m.disponibles > 0) : modelos;
    return buscarEquipos(lista, texto);
  }, [modelos, texto, soloConStock]);

  const totalDisponible = modelos.reduce((a, m) => a + m.disponibles, 0);
  const totalReservado = modelos.reduce((a, m) => a + m.reservados, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
        <Boxes className="size-5 text-muted-foreground" />
        <span className="text-sm">
          <strong className="text-lg tabular-nums text-foreground">{totalDisponible}</strong>{" "}
          <span className="text-muted-foreground">máquinas disponibles</span>
        </span>
        {totalReservado > 0 && (
          <span className="text-sm text-muted-foreground">
            · <strong className="tabular-nums text-foreground">{totalReservado}</strong> reservadas
          </span>
        )}
        <span className="ml-auto">
          <CargarStock modelos={modelos} />
        </span>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Busque el modelo: «rx135», «secadora primus 20»…"
            className="pl-8"
          />
        </div>
        <button
          type="button"
          onClick={() => setSoloConStock(!soloConStock)}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
            soloConStock ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
          )}
        >
          Solo los que tienen stock
        </button>
      </div>

      {resultados.length === 0 ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          {modelos.every((m) => m.maquinas.length === 0)
            ? "El almacén todavía está vacío. Cargue las series con el botón de arriba: se pegan de una columna del Excel, todas juntas."
            : "Ningún modelo coincide con esa búsqueda."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {resultados.map((m) => (
            <FilaModelo key={m.productoId} modelo={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilaModelo({ modelo: m }: { modelo: ModeloStock }) {
  const [abierto, setAbierto] = useState(false);
  const enAlmacen = m.maquinas.filter((x) => x.estado !== "despachado" && x.estado !== "baja");

  return (
    <article className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-3 text-left hover:bg-accent/50"
      >
        <span className="min-w-[200px] flex-1">
          <span className="text-sm font-semibold text-foreground">
            {m.marca} {m.modelo}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {m.nombre}
            {m.capacidad && ` · ${m.capacidad}`}
          </span>
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums",
            m.disponibles > 0 ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-secondary text-muted-foreground",
          )}
        >
          {m.disponibles} {m.disponibles === 1 ? "disponible" : "disponibles"}
        </span>
        {m.reservados > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-900">
            {m.reservados} reservada{m.reservados === 1 ? "" : "s"}
          </span>
        )}
      </button>

      {abierto && (
        <div className="border-t border-border p-3">
          {enAlmacen.length === 0 ? (
            <p className="text-xs text-muted-foreground">No queda ninguna máquina de este modelo en el almacén.</p>
          ) : (
            <ul className="space-y-1">
              {enAlmacen.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="w-40 font-mono font-semibold text-foreground">{x.serie}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      x.estado === "disponible" ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-amber-100 text-amber-900",
                    )}
                  >
                    {ETIQUETA_ESTADO[x.estado]}
                  </span>
                  {x.ubicacion && <span className="text-muted-foreground">{x.ubicacion}</span>}
                  {x.reservadoPara && <span className="text-muted-foreground">para {x.reservadoPara}</span>}
                  <span className="ml-auto">
                    <BotonesEstado id={x.id} serie={x.serie} estado={x.estado} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

function BotonesEstado({ id, serie, estado }: { id: string; serie: string; estado: string }) {
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  function mover(nuevo: "disponible" | "despachado" | "baja") {
    empezar(async () => {
      const r = await moverEquipo(id, nuevo, null);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`La ${serie} quedó como ${ETIQUETA_ESTADO[nuevo].toLowerCase()}.`);
      router.refresh();
    });
  }

  return (
    <span className="flex gap-1">
      {estado !== "disponible" && (
        <Button variant="ghost" size="sm" disabled={enviando} onClick={() => mover("disponible")}>
          Liberar
        </Button>
      )}
      {estado !== "despachado" && (
        <Button variant="ghost" size="sm" disabled={enviando} onClick={() => mover("despachado")}>
          Despachada
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        disabled={enviando}
        onClick={() => mover("baja")}
      >
        Baja
      </Button>
    </span>
  );
}

/** Cargar stock: se elige el modelo y se pegan las series, todas juntas. */
function CargarStock({ modelos }: { modelos: ModeloStock[] }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [productoId, setProductoId] = useState<string | null>(null);
  const [series, setSeries] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  const coincidencias = useMemo(() => buscarEquipos(modelos, texto).slice(0, 8), [modelos, texto]);
  const elegido = modelos.find((m) => m.productoId === productoId) ?? null;
  const cuantas = series.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean).length;

  function guardar() {
    if (!productoId) return;
    empezar(async () => {
      const r = await cargarSeries(productoId, series, ubicacion.trim() || null);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const partes = [`${r.cargadas} máquina${r.cargadas === 1 ? "" : "s"} en el almacén`];
      if (r.repetidas?.length) partes.push(`${r.repetidas.length} ya estaban (${r.repetidas.slice(0, 3).join(", ")}…)`);
      if (r.invalidas?.length) partes.push(`${r.invalidas.length} sin número de serie válido`);
      toast.success(partes.join(" · "));
      setSeries("");
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Package className="size-3.5" /> Cargar stock
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cargar máquinas al almacén</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Modelo</span>
            {elegido ? (
              <p className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                <span className="font-medium text-foreground">
                  {elegido.marca} {elegido.modelo}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setProductoId(null)}>
                  Cambiar
                </Button>
              </p>
            ) : (
              <>
                <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Busque el equipo…" />
                {texto.trim() && (
                  <ul className="max-h-44 overflow-y-auto rounded-md border border-border">
                    {coincidencias.map((m) => (
                      <li key={m.productoId}>
                        <button
                          type="button"
                          onClick={() => { setProductoId(m.productoId); setTexto(""); }}
                          className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                        >
                          <span className="font-medium text-foreground">
                            {m.marca} {m.modelo}
                          </span>
                          <span className="ml-2 text-muted-foreground">{m.nombre}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Números de serie
            </span>
            <textarea
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              rows={6}
              placeholder={"Uno por línea — se pegan de la columna del Excel:\nZ0090622\nZ0090623\nZ0090624"}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-sm outline-none focus:border-primary"
            />
            <span className="text-[11px] text-muted-foreground">
              {cuantas > 0 ? `${cuantas} serie${cuantas === 1 ? "" : "s"} para cargar.` : "Una por línea."} Las
              repetidas se avisan y no entran dos veces.
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Dónde están (opcional)
            </span>
            <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Almacén Lima, contenedor 3…" />
          </label>
        </div>

        <DialogFooter>
          <Button onClick={guardar} disabled={enviando || !productoId || cuantas === 0}>
            {enviando ? "Cargando…" : `Cargar ${cuantas || ""} al almacén`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
