"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, PackageX, ImageOff, X } from "lucide-react";
import { buscarEquipos } from "@/lib/buscar-equipo";
import { esSubtituloDeFicha } from "@/lib/ficha-tecnica";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * El selector de equipos del cotizador, en grande.
 *
 * PEDIDO DEL 25-08, después de dejar el catálogo 1 a 1 con el maestro de
 * Lesly: «un buscador más grande, tipo ventana emergente… los nombres son
 * largos… una imagen pequeñita y algunas características clave para que puedan
 * ir buscando mientras ponen el mouse en cada opción, sin hacer clic».
 *
 * El autocompletador angosto servía para teclear un código; para RECONOCER un
 * equipo no: los nombres del maestro son largos, la diferencia entre dos
 * variantes es una palabra (SINGLE / APILABLE) y la foto —que es lo que de
 * verdad confirma— solo aparecía después de elegir. De ahí salió el caso de la
 * SECU502: se eligió por el texto y el PDF llevó otra máquina.
 *
 * EL CLIC AGREGA, sin paso intermedio (mismo pedido, segunda vuelta): «al
 * señalar el producto ya debería quedar señalado, solo necesitaría un botón de
 * quitar». Elegir acá y después apretar «Agregar» afuera era confirmar dos
 * veces lo mismo — la confirmación visual ya ocurrió, con la foto delante.
 * Y LA VENTANA QUEDA ABIERTA: una cotización real lleva 4 a 6 equipos y se
 * cargan todos de una pasada. Cada fila muestra cuántas unidades lleva; otro
 * clic suma una; «Quitar» vive en el panel del equipo; «Listo» o Esc cierran.
 *
 * EL STOCK sale del propio Excel de Lesly (columna STOCK, guardada al cargar
 * cada equipo). No es inventario en vivo: es lo que dice el maestro, y así se
 * rotula. «Sin stock» no bloquea — se avisa, la decisión es del comercial.
 */

export interface EquipoElegible {
  id: string;
  sku: string | null;
  marca: string;
  modelo: string;
  nombre: string;
  capacidad: string | null;
  segmento: "industrial" | "semi_industrial";
  calentamiento?: string | null;
  panel?: string | null;
  controles?: string | null;
  fotoPath?: string | null;
  /** La ficha completa, títulos de bloque incluidos. */
  caracteristicas?: string[];
  sinFicha?: boolean;
  fotoPrestadaDe?: string | null;
  /** Unidades según la columna STOCK del Excel de Lesly. null = sin dato. */
  stock?: number | null;
  /** Precio de referencia ya resuelto (el del maestro). */
  precio?: number | null;
  /** Descripción del maestro de Lesly: solo alimenta la búsqueda, no se pinta
   *  (la tarjeta ya muestra la ficha completa). */
  descripcion?: string | null;
}

function BadgeStock({ stock }: { stock: number | null | undefined }) {
  if (stock === null || stock === undefined) {
    return <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">stock s/d</span>;
  }
  if (stock === 0) {
    return <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">sin stock</span>;
  }
  return (
    <span className="rounded-full bg-[#1E7F4F]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#1E7F4F]">
      {stock} en stock
    </span>
  );
}

function Miniatura({ equipo, grande = false }: { equipo: EquipoElegible; grande?: boolean }) {
  if (!equipo.fotoPath) {
    return (
      <span
        className={cn(
          "flex flex-none items-center justify-center rounded-md bg-secondary text-muted-foreground",
          grande ? "h-56 w-full" : "size-14",
        )}
      >
        <ImageOff className={grande ? "size-8" : "size-5"} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- foto local chica; next/image no aporta acá
    <img
      src={equipo.fotoPath}
      alt=""
      loading="lazy"
      className={cn(
        "flex-none rounded-md bg-white object-contain",
        grande ? "h-56 w-full border border-border p-2" : "size-14 border border-border p-0.5",
      )}
    />
  );
}

const monto = (n: number) => `US$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

/**
 * El material del tambor (galvanizado/inoxidable) es lo primero que pregunta
 * un cliente y antes solo aparecía escondido dentro de "Características
 * completas", bajo el título TAMBOR. En las 32 fichas que traen ese bloque el
 * patrón es siempre el mismo —el título va seguido de una sola línea con el
 * material ("Fabricado en acero inoxidable de alta resistencia.")—, así que
 * se saca esa línea a la lista rápida de specs, junto a Capacidad/Voltaje.
 */
function materialTambor(caracteristicas: string[] | undefined): string | null {
  const idx = caracteristicas?.findIndex((c) => c.trim().toUpperCase() === "TAMBOR") ?? -1;
  return idx === -1 ? null : (caracteristicas![idx + 1] ?? null);
}

/** El panel derecho: el equipo bajo el mouse, en grande y sin hacer clic. */
function PanelDetalle({
  equipo,
  unidades,
  onQuitar,
}: {
  equipo: EquipoElegible | null;
  unidades: number;
  onQuitar: (productoId: string) => void;
}) {
  if (!equipo) {
    return (
      <div className="hidden h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground sm:flex">
        <Search className="size-6" />
        Pase el mouse por un equipo
        <br />
        para verlo acá sin agregarlo.
      </div>
    );
  }
  const specs = [
    equipo.capacidad && ["Capacidad", equipo.capacidad],
    equipo.calentamiento && ["Calentamiento", equipo.calentamiento],
    equipo.panel && ["Panel", equipo.panel],
    equipo.controles && ["Voltaje", equipo.controles],
    materialTambor(equipo.caracteristicas) && ["Tambor", materialTambor(equipo.caracteristicas)],
  ].filter(Boolean) as [string, string][];
  return (
    <div className="hidden h-full flex-col gap-2 overflow-y-auto sm:flex">
      <Miniatura equipo={equipo} grande />
      <div>
        <p className="font-mono text-xs font-bold text-primary">{equipo.sku ?? "sin código"}</p>
        <p className="text-sm font-semibold leading-snug text-foreground">
          {equipo.marca} {equipo.modelo}
        </p>
        <p className="text-xs text-muted-foreground">{equipo.nombre}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {equipo.precio != null && (
          <span className="text-base font-bold tabular-nums text-foreground">{monto(equipo.precio)}</span>
        )}
        <BadgeStock stock={equipo.stock} />
      </div>
      {/* El estado del equipo en la cotización, y el único botón que hace
          falta: Quitar. Agregar es el clic en la fila. */}
      {unidades > 0 && (
        <div className="flex items-center justify-between rounded-md bg-primary/10 px-2 py-1.5">
          <span className="text-xs font-semibold text-primary">En la cotización: ×{unidades}</span>
          <button
            type="button"
            onClick={() => onQuitar(equipo.id)}
            className="cursor-pointer text-xs font-medium text-destructive hover:underline"
          >
            Quitar
          </button>
        </div>
      )}
      {specs.length > 0 && (
        <dl className="space-y-0.5 text-xs">
          {specs.map(([k, v]) => (
            <div key={k} className="flex gap-1.5">
              <dt className="w-24 flex-none text-muted-foreground">{k}</dt>
              <dd className="font-medium text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* La ficha COMPLETA (reunión con gerencia 25-08: «la característica
          completa se muestre»). Los títulos de bloque —TAMBOR, PUERTA,
          PROGRAMADOR— se pintan como secciones, igual que en el PDF, y la
          lista corre bajo su propio scroll para no empujar la foto. */}
      {(equipo.caracteristicas?.length ?? 0) > 0 && (
        <div className="border-t border-border pt-1.5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Características completas
          </p>
          <ul className="space-y-1 break-words pr-1 text-[11px] leading-snug text-muted-foreground">
            {equipo.caracteristicas!.map((c, i) =>
              esSubtituloDeFicha(c) ? (
                <li key={i} className="pt-1.5 text-[10px] font-bold uppercase tracking-wide text-foreground first:pt-0">
                  {c}
                </li>
              ) : (
                <li key={i} className="flex gap-1.5">
                  <span className="flex-none text-foreground">•</span>
                  <span>{c}</span>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
      {equipo.sinFicha && (
        <p className="rounded-md bg-amber-500/10 p-1.5 text-[11px] font-semibold text-amber-800">
          Sin ficha técnica cargada: su página saldrá vacía en el PDF.
        </p>
      )}
      {equipo.fotoPrestadaDe && (
        <p className="text-[11px] text-muted-foreground">La foto es la de {equipo.fotoPrestadaDe}, un equipo hermano.</p>
      )}
    </div>
  );
}

/**
 * Las unidades se cambian con botones explícitos, no repitiendo el clic.
 * Primera versión: cada clic sobre la fila sumaba una unidad — y un doble
 * clic sin querer dejaba ×2 sin que nadie lo pidiera (reportado el 25-08).
 * Ahora el clic AGREGA solo la primera vez; después la cantidad se maneja
 * con − / +, y el − en 1 quita el equipo.
 */
function Contador({
  unidades,
  onSumar,
  onRestar,
}: {
  unidades: number;
  onSumar: () => void;
  onRestar: () => void;
}) {
  const boton =
    "flex size-6 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-sm font-bold leading-none text-foreground transition-colors hover:bg-accent";
  return (
    <span
      className="flex items-center gap-1 rounded-full bg-primary/10 px-1 py-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" aria-label="Quitar una unidad" className={boton} onClick={onRestar}>
        −
      </button>
      <span className="min-w-5 text-center text-xs font-bold tabular-nums text-primary">{unidades}</span>
      <button type="button" aria-label="Sumar una unidad" className={boton} onClick={onSumar}>
        +
      </button>
    </span>
  );
}

export function BuscadorEquiposModal({
  productos,
  enCarrito,
  onAgregar,
  onRestar,
  onQuitar,
}: {
  productos: EquipoElegible[];
  /** producto_id → unidades ya en la cotización, para los badges. */
  enCarrito: Record<string, number>;
  /** Suma una unidad (o agrega el equipo si no estaba). */
  onAgregar: (p: EquipoElegible) => void;
  /** Resta una unidad; en 1, quita el equipo. */
  onRestar: (productoId: string) => void;
  onQuitar: (productoId: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);

  const coincidencias = useMemo(() => buscarEquipos(productos, texto), [productos, texto]);
  const enFoco = coincidencias[resaltado] ?? coincidencias[0] ?? null;
  const totalEquipos = Object.values(enCarrito).reduce((a, b) => a + b, 0);

  // El resaltado vuelve arriba con cada búsqueda; si quedara fuera de rango, el
  // panel mostraría un equipo que ya no está en la lista.
  useEffect(() => setResaltado(0), [texto]);
  useEffect(() => {
    listaRef.current?.querySelector('[data-resaltado="true"]')?.scrollIntoView({ block: "nearest" });
  }, [resaltado]);

  return (
    <>
      {/* La caja de siempre, pero es la puerta a la ventana grande: los nombres
          del maestro no caben en un desplegable angosto. */}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent"
        aria-haspopup="dialog"
      >
        <Search className="size-4 flex-none" />
        <span className="truncate">
          Buscar y agregar equipos…
          <span className="hidden xl:inline"> (código, marca, «secadora a gas», «rodillo eléctrico»)</span>
        </span>
        {totalEquipos > 0 && (
          <span className="ml-auto flex-none rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {totalEquipos} en la cotización
          </span>
        )}
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        {/* El botoncito de cierre de la esquina era fácil de no ver (reportado
            25-08): se apaga y el cierre vive en un botón con nombre al lado del
            buscador, más el «Listo» del pie y Esc. */}
        <DialogContent className="flex h-[88vh] w-[min(64rem,calc(100vw-2rem))] max-w-none flex-col gap-3 overflow-hidden sm:max-w-none" showCloseButton={false}>
          <DialogTitle className="sr-only">Buscar y agregar equipos</DialogTitle>
          <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setResaltado((i) => Math.min(i + 1, coincidencias.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setResaltado((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && enFoco) {
                  e.preventDefault();
                  // Igual que el clic: agrega solo si no estaba. Repetir Enter
                  // no infla la cantidad — para eso está el «+».
                  if (!(enCarrito[enFoco.id] ?? 0)) onAgregar(enFoco);
                }
              }}
              placeholder="Código, marca, modelo, capacidad o cómo lo pide el cliente…"
              className="pl-8"
              aria-label="Buscar equipo"
            />
          </div>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="flex h-9 flex-none cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            aria-label="Cerrar el buscador"
          >
            <X className="size-4" />
            Cerrar
          </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_280px] xl:grid-cols-[1fr_340px]">
            <ul ref={listaRef} className="space-y-1 overflow-y-auto overflow-x-hidden pr-1" role="listbox" aria-label="Equipos">
              {coincidencias.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={(enCarrito[p.id] ?? 0) > 0}
                    data-resaltado={i === resaltado}
                    onMouseEnter={() => setResaltado(i)}
                    onClick={() => {
                      if (!(enCarrito[p.id] ?? 0)) onAgregar(p);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-md border p-2 text-left transition-colors",
                      i === resaltado ? "border-primary/40 bg-accent" : "border-transparent",
                      (enCarrito[p.id] ?? 0) > 0 && "bg-primary/5",
                    )}
                  >
                    <Miniatura equipo={p} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        <span className="font-mono text-xs font-bold text-primary">{p.sku ?? "s/cód"}</span>
                        {" · "}
                        {p.marca} {p.modelo}
                        {p.capacidad ? ` · ${p.capacidad}` : ""}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{p.nombre}</span>
                    </span>
                    {/* Apilado en vertical a propósito: en laptop, contador y
                        stock lado a lado desbordaban la fila — la cantidad
                        quedaba fuera de vista y aparecía scroll horizontal. */}
                    <span className="flex flex-none flex-col items-end gap-1">
                      {p.precio != null && (
                        <span className="text-sm font-semibold tabular-nums text-foreground">{monto(p.precio)}</span>
                      )}
                      {(enCarrito[p.id] ?? 0) > 0 && (
                        <Contador
                          unidades={enCarrito[p.id]}
                          onSumar={() => onAgregar(p)}
                          onRestar={() => onRestar(p.id)}
                        />
                      )}
                      <BadgeStock stock={p.stock} />
                    </span>
                  </button>
                </li>
              ))}
              {coincidencias.length === 0 && (
                <li className="flex flex-col items-center gap-2 p-6 text-center text-xs text-muted-foreground">
                  <PackageX className="size-6" />
                  Ningún equipo del catálogo coincide con «{texto.trim()}».
                  <br />
                  El catálogo es el Excel de Lesly: si el equipo no está ahí, no se puede cotizar desde acá.
                </li>
              )}
            </ul>
            <PanelDetalle
              equipo={enFoco}
              unidades={enFoco ? (enCarrito[enFoco.id] ?? 0) : 0}
              onQuitar={onQuitar}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Clic o Enter agregan el equipo; las unidades se cambian con − y +. El stock es el de la CODIFICACIÓN de Lesly, no un
              inventario en vivo.
            </p>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="flex-none cursor-pointer rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Listo{totalEquipos > 0 ? ` (${totalEquipos} equipo${totalEquipos === 1 ? "" : "s"})` : ""}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
