"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, FileText, ImageOff, Plus, Trash2 } from "lucide-react";
import { bloquesATexto, textoABloques, type BloqueFicha } from "@/lib/ficha-texto";
import { crearEquipoDesdeFicha, fijarPrecio, guardarEquipo, type DatosEquipo } from "@/lib/acciones/productos";
import { TIPOS_EQUIPO, casillasDe, tipoDeCategoria, type CasillaEquipo } from "@/lib/tipos-equipo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * La hoja técnica del equipo, tal como sale impresa, y editable ahí mismo.
 *
 * POR QUÉ ASÍ Y NO UN FORMULARIO. Lo que hay que comprobar de un equipo es cómo
 * QUEDA la hoja que recibe el cliente: si el nombre entra en el título, si la
 * capacidad está en la casilla que le toca, si la descripción se lee. Un
 * formulario de campos apilados contesta «qué dice cada dato» y no contesta
 * ninguna de esas. Así que la pantalla ES la hoja —mismo título, mismo
 * encabezado de especificaciones, foto a la izquierda y descripción a la
 * derecha (docs/14)— y se edita encima de lo que se está mirando.
 *
 * LAS CASILLAS SALEN DEL TIPO DE EQUIPO. Una plancha no tiene panel
 * computarizado —ninguna de las 26 del catálogo lo tiene— y un coche solo pide
 * volumen y color. Ofrecer los siete campos a todos hace que quien carga un
 * equipo se pregunte si se le olvidó algo. Ver `tipos-equipo.ts`.
 *
 * ES LA MISMA HOJA PARA CARGAR UNO NUEVO, con una pregunta al principio: qué se
 * está cargando. Dos formularios distintos —uno de alta y otro de corrección—
 * es la manera segura de que las fichas nuevas salgan con otra forma.
 */

export interface EquipoEditable {
  id: string | null;
  nombre: string;
  marca: string;
  modelo: string;
  sku: string | null;
  categoria: string | null;
  capacidad: string | null;
  segmento: "industrial" | "semi_industrial";
  activo: boolean;
  calentamiento: string | null;
  panel: string | null;
  controles: string | null;
  montaje: string | null;
  colores: string[];
  fotoPath: string | null;
  fichaTexto: string;
  precios: { tier: string; precio: number }[];
  disponibles: number | null;
}

export const EQUIPO_NUEVO: EquipoEditable = {
  id: null,
  nombre: "",
  marca: "",
  modelo: "",
  sku: null,
  categoria: null,
  capacidad: null,
  segmento: "industrial",
  activo: true,
  calentamiento: null,
  panel: null,
  controles: null,
  montaje: null,
  colores: [],
  fotoPath: null,
  fichaTexto: "# CARACTERÍSTICAS\n- ",
  precios: [],
  disponibles: null,
};

const ETIQUETA_TIPO: Record<BloqueFicha["t"], string> = {
  titulo: "Título",
  subtitulo: "Subtítulo",
  vineta: "Viñeta",
  dato: "Dato",
};

export function FichaTecnicaEditor({ equipo, onListo }: { equipo: EquipoEditable; onListo: () => void }) {
  const esNuevo = equipo.id === null;
  const [d, setD] = useState(equipo);
  const [bloques, setBloques] = useState<BloqueFicha[]>(() => textoABloques(equipo.fichaTexto));
  const [precio, setPrecio] = useState(String(equipo.precios[0]?.precio ?? ""));
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  const set = <K extends keyof EquipoEditable>(k: K, v: EquipoEditable[K]) => setD({ ...d, [k]: v });

  // Un equipo nuevo empieza por la pregunta: qué se está cargando.
  const [eligiendoTipo, setEligiendoTipo] = useState(esNuevo);

  const yaCargadas: CasillaEquipo[] = [
    d.capacidad && "capacidad",
    d.calentamiento && "calentamiento",
    d.panel && "panel",
    d.controles && "controles",
    d.montaje && "montaje",
    d.colores.length > 0 && "colores",
  ].filter(Boolean) as CasillaEquipo[];
  const casillas = casillasDe(d.categoria, yaCargadas);
  const tipo = tipoDeCategoria(d.categoria);

  function guardar() {
    empezar(async () => {
      const datos: DatosEquipo = {
        nombre: d.nombre,
        marca: d.marca,
        modelo: d.modelo,
        sku: d.sku,
        categoria: d.categoria,
        capacidad: d.capacidad,
        segmento: d.segmento,
        activo: d.activo,
        calentamiento: d.calentamiento,
        panel: d.panel,
        controles: d.controles,
        montaje: d.montaje,
        colores: d.colores,
        fichaTexto: bloquesATexto(bloques),
      };

      if (esNuevo) {
        const r = await crearEquipoDesdeFicha(datos, Number(precio) || null);
        if (r.error) {
          toast.error(r.error);
          return;
        }
        toast.success(`${d.marca} ${d.modelo} entró al catálogo.`);
      } else {
        const r = await guardarEquipo(equipo.id!, datos);
        if (r.error) {
          toast.error(r.error);
          return;
        }
        const nuevo = Number(precio);
        const anterior = equipo.precios[0];
        if (anterior && Number.isFinite(nuevo) && nuevo !== anterior.precio) {
          const rp = await fijarPrecio(equipo.id!, anterior.tier, nuevo);
          if (rp.error) {
            toast.error(`Precio: ${rp.error}`);
            return;
          }
        }
        toast.success("Ficha guardada.");
      }
      onListo();
      router.refresh();
    });
  }

  // ── La pregunta de apertura, solo al cargar uno nuevo ──────────────
  if (eligiendoTipo) {
    return (
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">¿Qué equipo va a cargar?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIPOS_EQUIPO.map((t) => (
            <button
              key={t.clave}
              type="button"
              onClick={() => {
                setD({ ...d, categoria: t.clave });
                setEligiendoTipo(false);
              }}
              className="group rounded-xl border border-border p-4 text-left transition-all hover:border-primary hover:bg-accent/40 hover:shadow-sm"
            >
              <p className="text-sm font-semibold text-foreground">{t.nombre}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t.ejemplo}</p>
              <p className="mt-2 text-[11px] text-muted-foreground/80">
                {t.casillas.length} casillas: {t.casillas.map((c) => ROTULO[c].toLowerCase()).join(", ")}
              </p>
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          La hoja se acomoda al tipo: una plancha no muestra «panel computarizado» porque ninguna lo tiene, y un coche
          pide volumen en vez de capacidad. Se puede cambiar después.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── LA HOJA ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border shadow-sm ring-1 ring-black/[0.03]">
        {/* Título del ítem */}
        <div className="flex items-center gap-3 bg-[#7E1210] px-4 py-3">
          <span className="flex-none rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-white/90">
            ITEM I
          </span>
          <input
            value={d.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="NOMBRE DEL EQUIPO"
            className="w-full bg-transparent text-base font-bold uppercase tracking-tight text-white outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-white/40"
          />
        </div>

        {/* Especificaciones: rótulo arriba, valor debajo, como en la hoja */}
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-4">
          <Casilla rotulo="Marca" valor={d.marca} onChange={(v) => set("marca", v)} obligatorio />
          <Casilla rotulo="Modelo" valor={d.modelo} onChange={(v) => set("modelo", v)} obligatorio />
          {casillas.includes("capacidad") && (
            <Casilla
              rotulo={tipo?.rotuloCapacidad ?? "Capacidad"}
              valor={d.capacidad ?? ""}
              onChange={(v) => set("capacidad", v || null)}
            />
          )}
          {casillas.includes("calentamiento") && (
            <Casilla
              rotulo="Calentamiento"
              valor={d.calentamiento ?? ""}
              onChange={(v) => set("calentamiento", v || null)}
              sugerencias={["ELÉCTRICA", "GAS GLP", "GAS NATURAL", "VAPOR"]}
            />
          )}
          {casillas.includes("panel") && (
            <Casilla rotulo="Panel computarizado" valor={d.panel ?? ""} onChange={(v) => set("panel", v || null)} />
          )}
          {casillas.includes("controles") && (
            <Casilla rotulo="Controles Automático" valor={d.controles ?? ""} onChange={(v) => set("controles", v || null)} />
          )}
          {casillas.includes("montaje") && (
            <Casilla
              rotulo="Montaje"
              valor={d.montaje ?? ""}
              onChange={(v) => set("montaje", v || null)}
              sugerencias={["Apilable", "No apilable"]}
            />
          )}
          {casillas.includes("colores") && (
            <Casilla
              rotulo="Colores"
              valor={d.colores.join(" / ")}
              onChange={(v) => set("colores", v.split("/").map((x) => x.trim()).filter(Boolean))}
              ayuda="separados por /"
            />
          )}
        </div>

        {/* Foto y descripción */}
        <div className="grid gap-px bg-border md:grid-cols-[34%_1fr]">
          <div className="flex items-center justify-center bg-card p-4">
            {d.fotoPath ? (
              <Image
                src={`/productos/${d.fotoPath.split("/").pop()}`}
                alt={`${d.marca} ${d.modelo}`}
                width={240}
                height={240}
                className="max-h-60 w-auto object-contain"
                unoptimized
              />
            ) : (
              <span className="flex flex-col items-center gap-2 py-10 text-center text-xs text-muted-foreground">
                <ImageOff className="size-6 opacity-40" />
                Sin foto todavía
              </span>
            )}
          </div>

          <div className="space-y-px bg-card p-3">
            {bloques.map((b, i) => (
              <LineaFicha
                key={i}
                bloque={b}
                onCambiar={(nuevo) => setBloques(bloques.map((x, j) => (j === i ? nuevo : x)))}
                onBorrar={() => setBloques(bloques.filter((_, j) => j !== i))}
                onAgregarDebajo={() =>
                  setBloques([...bloques.slice(0, i + 1), { t: "vineta", texto: "" }, ...bloques.slice(i + 1)])
                }
              />
            ))}
            <button
              type="button"
              onClick={() => setBloques([...bloques, { t: "vineta", texto: "" }])}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3" /> Agregar línea
            </button>
          </div>
        </div>
      </div>

      {/* ── LO QUE NO SALE EN LA HOJA PERO MANDA EN EL CRM ──────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CampoFlotante etiqueta="Código (SKU)" valor={d.sku ?? ""} onChange={(v) => set("sku", v || null)} mono />
        <label className="relative block">
          <select
            value={d.categoria ?? ""}
            onChange={(e) => set("categoria", e.target.value || null)}
            className="peer h-[52px] w-full rounded-lg border border-border bg-card px-3 pt-5 text-sm capitalize outline-none transition-colors focus:border-primary"
          >
            {TIPOS_EQUIPO.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.nombre}
              </option>
            ))}
            {d.categoria && !tipo && <option value={d.categoria}>{d.categoria}</option>}
          </select>
          <span className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tipo de equipo
          </span>
        </label>
        <label className="relative block">
          <select
            value={d.segmento}
            onChange={(e) => set("segmento", e.target.value as EquipoEditable["segmento"])}
            className="h-[52px] w-full rounded-lg border border-border bg-card px-3 pt-5 text-sm outline-none transition-colors focus:border-primary"
          >
            <option value="industrial">industrial</option>
            <option value="semi_industrial">semi-industrial</option>
          </select>
          <span className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Segmento
          </span>
        </label>
        <CampoFlotante
          etiqueta={equipo.precios[0] ? `Precio (${equipo.precios[0].tier})` : "Precio"}
          valor={precio}
          onChange={(v) => setPrecio(v.replace(/[^\d.]/g, ""))}
          mono
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded border transition-colors",
              d.activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            {d.activo && <Check className="size-3" />}
          </span>
          <input type="checkbox" checked={d.activo} onChange={(e) => set("activo", e.target.checked)} className="sr-only" />
          <span className="text-foreground">
            {d.activo ? "En el catálogo — el comercial lo encuentra" : "Fuera del catálogo — el comercial no lo ve"}
          </span>
        </label>
        {!esNuevo && (
          <span className="text-[11px] text-muted-foreground">
            {d.disponibles === null ? "stock sin cargar" : d.disponibles > 0 ? `${d.disponibles} en almacén` : "sin stock"}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : esNuevo ? "Cargar el equipo al catálogo" : "Guardar los cambios"}
        </Button>
        {!esNuevo && (
          <>
            <a
              href={`/api/productos/${equipo.id}/vista-previa`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              <FileText className="size-3.5" /> Ver el PDF, Efameinsa
            </a>
            <a
              href={`/api/productos/${equipo.id}/vista-previa?serie=OPEN`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              <FileText className="size-3.5" /> en Open
            </a>
            <span className="text-[11px] text-muted-foreground">El PDF abre lo guardado: guarde primero.</span>
          </>
        )}
      </div>
    </div>
  );
}

const ROTULO: Record<CasillaEquipo, string> = {
  capacidad: "Capacidad",
  calentamiento: "Calentamiento",
  panel: "Panel",
  controles: "Controles",
  montaje: "Montaje",
  colores: "Colores",
};

/** Una casilla del encabezado: el rótulo vive DENTRO del campo, arriba. */
function Casilla({
  rotulo,
  valor,
  onChange,
  obligatorio = false,
  sugerencias,
  ayuda,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  obligatorio?: boolean;
  sugerencias?: string[];
  ayuda?: string;
}) {
  const vacia = valor.trim() === "";
  const id = `casilla-${rotulo.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div
      className={cn(
        "group relative bg-card px-3 pb-2 pt-6 transition-colors focus-within:bg-accent/40",
        vacia && !obligatorio && "bg-secondary/40",
      )}
    >
      <span className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        list={sugerencias ? id : undefined}
        placeholder={obligatorio ? "obligatorio" : ayuda ?? "no sale impresa"}
        className={cn(
          "w-full bg-transparent text-sm font-medium text-foreground outline-none",
          obligatorio && vacia ? "placeholder:font-normal placeholder:text-destructive/70" : "placeholder:font-normal placeholder:text-muted-foreground/50",
        )}
      />
      {sugerencias && (
        <datalist id={id}>
          {sugerencias.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/** Una línea de la descripción, con su forma y su texto. */
function LineaFicha({
  bloque,
  onCambiar,
  onBorrar,
  onAgregarDebajo,
}: {
  bloque: BloqueFicha;
  onCambiar: (b: BloqueFicha) => void;
  onBorrar: () => void;
  onAgregarDebajo: () => void;
}) {
  return (
    <div className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/50">
      <select
        value={bloque.t}
        onChange={(e) => {
          const t = e.target.value as BloqueFicha["t"];
          if (t === "dato") onCambiar({ t, rotulo: bloque.texto ?? bloque.rotulo ?? "", valor: bloque.valor ?? "" });
          else onCambiar({ t, texto: bloque.texto ?? [bloque.rotulo, bloque.valor].filter(Boolean).join(": ") });
        }}
        title="Qué es esta línea en la hoja impresa"
        className="w-[70px] flex-none cursor-pointer rounded border-none bg-transparent text-[10px] uppercase tracking-wide text-muted-foreground/70 outline-none transition-colors hover:text-foreground focus:text-foreground"
      >
        {(Object.keys(ETIQUETA_TIPO) as BloqueFicha["t"][]).map((t) => (
          <option key={t} value={t}>
            {ETIQUETA_TIPO[t]}
          </option>
        ))}
      </select>

      {bloque.t === "dato" ? (
        <span className="flex min-w-0 flex-1 items-baseline gap-1">
          <input
            value={bloque.rotulo ?? ""}
            onChange={(e) => onCambiar({ ...bloque, rotulo: e.target.value })}
            placeholder="Rótulo"
            className="w-2/5 min-w-0 rounded border-b border-transparent bg-transparent px-1 text-xs font-semibold text-foreground outline-none transition-colors focus:border-primary"
          />
          <span className="text-xs text-muted-foreground">:</span>
          <input
            value={bloque.valor ?? ""}
            onChange={(e) => onCambiar({ ...bloque, valor: e.target.value })}
            placeholder="valor"
            className="min-w-0 flex-1 rounded border-b border-transparent bg-transparent px-1 text-xs outline-none transition-colors focus:border-primary"
          />
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          {bloque.t === "vineta" && <span className="text-[10px] text-muted-foreground">●</span>}
          <input
            value={bloque.texto ?? ""}
            onChange={(e) => onCambiar({ ...bloque, texto: e.target.value })}
            placeholder={
              bloque.t === "titulo" ? "TÍTULO DE SECCIÓN" : bloque.t === "subtitulo" ? "Subtítulo" : "texto de la viñeta"
            }
            className={cn(
              "min-w-0 flex-1 rounded border-b border-transparent bg-transparent px-1 outline-none transition-colors focus:border-primary",
              bloque.t === "titulo" && "text-[11px] font-bold uppercase tracking-wide text-[#7E1210]",
              bloque.t === "subtitulo" && "text-xs font-semibold text-foreground",
              bloque.t === "vineta" && "text-xs text-foreground",
            )}
          />
        </span>
      )}

      <span className="flex flex-none gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          onClick={onAgregarDebajo}
          title="Agregar una línea debajo"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3" />
        </button>
        <button
          type="button"
          onClick={onBorrar}
          title="Quitar esta línea"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3" />
        </button>
      </span>
    </div>
  );
}

/** Campo con el rótulo dentro, arriba: ocupa una línea en vez de dos. */
function CampoFlotante({
  etiqueta,
  valor,
  onChange,
  mono = false,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="relative block">
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-[52px] w-full rounded-lg border border-border bg-card px-3 pt-5 text-sm outline-none transition-colors focus:border-primary",
          mono && "font-mono",
        )}
      />
      <span className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </span>
    </label>
  );
}
