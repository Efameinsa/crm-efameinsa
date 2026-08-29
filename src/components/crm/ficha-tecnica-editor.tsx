"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Plus, Trash2 } from "lucide-react";
import { bloquesATexto, textoABloques, type BloqueFicha } from "@/lib/ficha-texto";
import { crearEquipoDesdeFicha, fijarPrecio, guardarEquipo, type DatosEquipo } from "@/lib/acciones/productos";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * La hoja técnica del equipo, tal como sale impresa, y editable ahí mismo.
 *
 * POR QUÉ ASÍ Y NO UN FORMULARIO. Lo que hay que comprobar de un equipo es cómo
 * QUEDA la hoja que recibe el cliente: si el nombre entra en el título, si la
 * capacidad está en la casilla que le toca, si la descripción se lee. Un
 * formulario con veinte campos apilados contesta «qué dice cada dato» y no
 * contesta ninguna de esas. Así que esta pantalla es la hoja: mismo título en
 * granate, mismo encabezado gris de especificaciones, misma foto a la izquierda
 * y descripción a la derecha (docs/14, la maquetación del PDF). Se edita encima
 * de lo que se está mirando, y recién después se abre el PDF de verdad para
 * confirmar.
 *
 * ES LA MISMA HOJA PARA CARGAR UNO NUEVO. Dos formularios distintos —uno de
 * alta y otro de corrección— es la manera segura de que las fichas nuevas
 * salgan con otra forma que las viejas.
 *
 * LAS CASILLAS VACÍAS SE VEN. Calentamiento, panel, controles y color no salen
 * impresos si están vacíos, y por eso mismo hay que poder verlos vacíos: si no,
 * la única forma de saber que a un equipo le falta el calentamiento es notar su
 * ausencia en un PDF.
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

  return (
    <div className="space-y-3">
      {/* ── LA HOJA ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-md border-2 border-[#2C2E35]">
        {/* Fila 1 — título del ítem */}
        <div className="flex items-center gap-2 bg-[#7E1210] px-3 py-2">
          <span className="flex-none font-mono text-xs font-bold text-white/70">ITEM I.-</span>
          <input
            value={d.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="NOMBRE DEL EQUIPO"
            className="w-full bg-transparent text-sm font-bold uppercase text-white outline-none placeholder:text-white/40"
          />
        </div>

        {/* Filas 2 y 3 — encabezado de especificaciones y sus valores */}
        <div className="grid grid-cols-2 border-b border-[#2C2E35] sm:grid-cols-4 lg:grid-cols-7">
          <Casilla titulo="Marca" valor={d.marca} onChange={(v) => set("marca", v)} obligatorio />
          <Casilla titulo="Modelo" valor={d.modelo} onChange={(v) => set("modelo", v)} obligatorio />
          <Casilla titulo="Capacidad" valor={d.capacidad ?? ""} onChange={(v) => set("capacidad", v || null)} />
          <Casilla
            titulo="Calentamiento"
            valor={d.calentamiento ?? ""}
            onChange={(v) => set("calentamiento", v || null)}
          />
          <Casilla titulo="Panel computarizado" valor={d.panel ?? ""} onChange={(v) => set("panel", v || null)} />
          <Casilla titulo="Controles Automático" valor={d.controles ?? ""} onChange={(v) => set("controles", v || null)} />
          <Casilla
            titulo="Color"
            valor={d.colores.join(" / ")}
            onChange={(v) => set("colores", v.split("/").map((x) => x.trim()).filter(Boolean))}
          />
        </div>

        {/* Fila 4 — foto a la izquierda, descripción a la derecha */}
        <div className="grid gap-0 md:grid-cols-[35%_1fr]">
          <div className="flex items-start justify-center border-b border-[#2C2E35] p-3 md:border-b-0 md:border-r">
            {d.fotoPath ? (
              <Image
                src={`/productos/${d.fotoPath.split("/").pop()}`}
                alt={`${d.marca} ${d.modelo}`}
                width={220}
                height={220}
                className="max-h-56 w-auto object-contain"
                unoptimized
              />
            ) : (
              <span className="flex h-40 items-center px-4 text-center text-xs text-muted-foreground">
                Sin foto. La foto se carga en el archivo del equipo, no desde acá.
              </span>
            )}
          </div>

          <div className="space-y-0.5 p-3">
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
              className="mt-1 inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
            >
              <Plus className="size-3" /> Agregar línea
            </button>
          </div>
        </div>
      </div>

      {/* ── LO QUE NO SALE EN LA HOJA PERO MANDA EN EL CRM ──────────── */}
      <div className="grid gap-3 rounded-md border border-border bg-secondary/30 p-3 sm:grid-cols-3 lg:grid-cols-5">
        <Campo titulo="Código (SKU)" valor={d.sku ?? ""} onChange={(v) => set("sku", v || null)} mono />
        <Campo titulo="Categoría" valor={d.categoria ?? ""} onChange={(v) => set("categoria", v || null)} />
        <label className="block space-y-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Segmento</span>
          <select
            value={d.segmento}
            onChange={(e) => set("segmento", e.target.value as EquipoEditable["segmento"])}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
          >
            <option value="industrial">industrial</option>
            <option value="semi_industrial">semi-industrial</option>
          </select>
        </label>
        <Campo
          titulo={equipo.precios[0] ? `Precio (${equipo.precios[0].tier})` : "Precio"}
          valor={precio}
          onChange={(v) => setPrecio(v.replace(/[^\d.]/g, ""))}
          mono
        />
        <div className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">En el catálogo</span>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={d.activo} onChange={(e) => set("activo", e.target.checked)} />
            <span>{d.activo ? "el comercial lo encuentra" : "oculto para el comercial"}</span>
          </label>
          {!esNuevo && (
            <p className="text-[11px] text-muted-foreground">
              {d.disponibles === null
                ? "sin stock cargado"
                : d.disponibles > 0
                  ? `${d.disponibles} en almacén`
                  : "sin stock"}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : esNuevo ? "Cargar el equipo al catálogo" : "Guardar los cambios"}
        </Button>
        {!esNuevo && (
          <>
            <a
              href={`/api/productos/${equipo.id}/vista-previa`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <FileText className="size-3.5" /> Ver el PDF, Efameinsa
            </a>
            <a
              href={`/api/productos/${equipo.id}/vista-previa?serie=OPEN`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <FileText className="size-3.5" /> en Open
            </a>
            <span className="text-[11px] text-muted-foreground">
              El PDF abre lo guardado: guarde primero para ver los cambios.
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** Una casilla del encabezado de especificaciones: rótulo gris arriba, valor debajo. */
function Casilla({
  titulo,
  valor,
  onChange,
  obligatorio = false,
}: {
  titulo: string;
  valor: string;
  onChange: (v: string) => void;
  obligatorio?: boolean;
}) {
  const vacia = valor.trim() === "";
  return (
    <div className={cn("border-r border-[#2C2E35] last:border-r-0", vacia && !obligatorio && "opacity-55")}>
      <p className="border-b border-[#2C2E35] bg-[#E8E8E8] px-2 py-1 text-center text-[10px] font-bold uppercase leading-tight text-[#2C2E35]">
        {titulo}
      </p>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={obligatorio ? "obligatorio" : "no sale impresa"}
        className={cn(
          "w-full bg-transparent px-2 py-1.5 text-center text-xs outline-none focus:bg-accent",
          obligatorio && vacia ? "placeholder:text-destructive/70" : "placeholder:text-muted-foreground/60",
        )}
      />
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
    <div className="group flex items-start gap-1">
      <select
        value={bloque.t}
        onChange={(e) => {
          const t = e.target.value as BloqueFicha["t"];
          if (t === "dato") onCambiar({ t, rotulo: bloque.texto ?? bloque.rotulo ?? "", valor: bloque.valor ?? "" });
          else onCambiar({ t, texto: bloque.texto ?? [bloque.rotulo, bloque.valor].filter(Boolean).join(": ") });
        }}
        title="Qué es esta línea en la hoja impresa"
        className="mt-0.5 w-[74px] flex-none rounded border border-transparent bg-transparent text-[10px] text-muted-foreground outline-none hover:border-border focus:border-primary"
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
            className="w-2/5 min-w-0 border-b border-transparent bg-transparent text-xs font-semibold text-foreground outline-none hover:border-border focus:border-primary"
          />
          <span className="text-xs text-muted-foreground">:</span>
          <input
            value={bloque.valor ?? ""}
            onChange={(e) => onCambiar({ ...bloque, valor: e.target.value })}
            placeholder="valor"
            className="min-w-0 flex-1 border-b border-transparent bg-transparent text-xs outline-none hover:border-border focus:border-primary"
          />
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-baseline gap-1">
          {bloque.t === "vineta" && <span className="text-xs text-muted-foreground">·</span>}
          <input
            value={bloque.texto ?? ""}
            onChange={(e) => onCambiar({ ...bloque, texto: e.target.value })}
            placeholder={bloque.t === "titulo" ? "TÍTULO DE SECCIÓN" : bloque.t === "subtitulo" ? "Subtítulo" : "texto de la viñeta"}
            className={cn(
              "min-w-0 flex-1 border-b border-transparent bg-transparent outline-none hover:border-border focus:border-primary",
              bloque.t === "titulo" && "text-[11px] font-bold uppercase tracking-wide text-[#7E1210]",
              bloque.t === "subtitulo" && "text-xs font-semibold text-foreground",
              bloque.t === "vineta" && "text-xs text-foreground",
            )}
          />
        </span>
      )}

      <span className="flex flex-none gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onAgregarDebajo}
          title="Agregar una línea debajo"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3" />
        </button>
        <button
          type="button"
          onClick={onBorrar}
          title="Quitar esta línea"
          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3" />
        </button>
      </span>
    </div>
  );
}

function Campo({
  titulo,
  valor,
  onChange,
  mono = false,
}: {
  titulo: string;
  valor: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary",
          mono && "font-mono",
        )}
      />
    </label>
  );
}
