"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, PackageX, ImageOff } from "lucide-react";
import { buscarEquipos } from "@/lib/buscar-equipo";
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
  primerasCaracteristicas?: string[];
  nCaracteristicas?: number;
  sinFicha?: boolean;
  fotoPrestadaDe?: string | null;
  /** Unidades según la columna STOCK del Excel de Lesly. null = sin dato. */
  stock?: number | null;
  /** Precio de referencia ya resuelto (el del maestro). */
  precio?: number | null;
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
      {(equipo.primerasCaracteristicas?.length ?? 0) > 0 && (
        <ul className="space-y-0.5 border-t border-border pt-1.5 text-[11px] text-muted-foreground">
          {equipo.primerasCaracteristicas!.map((c, i) => (
            <li key={i} className="flex gap-1">
              <span className="text-foreground">•</span>
              <span className="line-clamp-2">{c}</span>
            </li>
          ))}
          {(equipo.nCaracteristicas ?? 0) > equipo.primerasCaracteristicas!.length && (
            <li className="italic">…y {equipo.nCaracteristicas! - equipo.primerasCaracteristicas!.length} más en el PDF.</li>
          )}
        </ul>
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

export function BuscadorEquiposModal({
  productos,
  enCarrito,
  onAgregar,
  onQuitar,
}: {
  productos: EquipoElegible[];
  /** producto_id → unidades ya en la cotización, para los badges. */
  enCarrito: Record<string, number>;
  onAgregar: (p: EquipoElegible) => void;
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
        className="flex h-9 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent"
        aria-haspopup="dialog"
      >
        <Search className="size-4 flex-none" />
        <span className="truncate">Buscar y agregar equipos… (código, marca, «secadora a gas», «rodillo eléctrico»)</span>
        {totalEquipos > 0 && (
          <span className="ml-auto flex-none rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {totalEquipos} en la cotización
          </span>
        )}
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="flex h-[86vh] max-w-4xl flex-col gap-3 sm:max-w-4xl">
          <DialogTitle className="sr-only">Buscar y agregar equipos</DialogTitle>
          <div className="relative">
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
                  onAgregar(enFoco);
                }
              }}
              placeholder="Código, marca, modelo, capacidad o cómo lo pide el cliente…"
              className="pl-8"
              aria-label="Buscar equipo"
            />
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_280px]">
            <ul ref={listaRef} className="space-y-1 overflow-y-auto pr-1" role="listbox" aria-label="Equipos">
              {coincidencias.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={(enCarrito[p.id] ?? 0) > 0}
                    data-resaltado={i === resaltado}
                    onMouseEnter={() => setResaltado(i)}
                    onClick={() => onAgregar(p)}
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
                    <span className="flex flex-none flex-col items-end gap-1">
                      {p.precio != null && (
                        <span className="text-sm font-semibold tabular-nums text-foreground">{monto(p.precio)}</span>
                      )}
                      <span className="flex items-center gap-1">
                        {(enCarrito[p.id] ?? 0) > 0 && (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                            ✓ ×{enCarrito[p.id]}
                          </span>
                        )}
                        <BadgeStock stock={p.stock} />
                      </span>
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
              Clic o Enter agregan; otro clic suma una unidad. El stock es el de la CODIFICACIÓN de Lesly, no un
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
