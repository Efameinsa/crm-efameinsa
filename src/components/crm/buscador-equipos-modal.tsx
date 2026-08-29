"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, PackageX, ImageOff, X, ArrowRight, Check } from "lucide-react";
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
 * cargan todos de una pasada. Cada fila muestra cuántas unidades lleva, con
 * − / + para cambiarlas y ✕ para sacar el equipo entero; «Continuar con la
 * cotización» o Esc cierran.
 *
 * Que quede abierta costó un bug (27-08): al elegir el PRIMER equipo la ventana
 * se cerraba sola. No era cosa del modal — el autoguardado creaba el borrador,
 * revalidaba la ruta y el refresco volvía a montar la pantalla entera. Está
 * arreglado en `guardarBorradorCotizacion`, que ya no revalida nada.
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
  /** «Apilable» / «No apilable»: solo lo declara LG, y es lo único que separa a
   *  la LAVMA17 de la LAVMA172. */
  montaje?: string | null;
  segmento: "industrial" | "semi_industrial";
  calentamiento?: string | null;
  panel?: string | null;
  controles?: string | null;
  /** Colores en los que existe el equipo (coches de transporte, principalmente). */
  stockEnVivo?: boolean;
  colores?: string[];
  fotoPath?: string | null;
  /** Una foto por color, cuando Lesly hizo ficha de cada uno. */
  fotosPorColor?: Record<string, string>;
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

/**
 * Cuántas hay. Y de dónde sale ese número, que no es un detalle: hasta el
 * 28-08 el único stock que se veía acá era `ficha.stock_referencia`, una
 * cifra copiada del Excel del maestro que envejece el día que se carga. Con
 * el almacén cargado (migración 0117) el número es un conteo de máquinas con
 * su serie, y entonces sí se puede prometer una entrega mirándolo.
 *
 * Mientras el almacén se termina de cargar conviven los dos, y se dicen
 * distinto: «en almacén» es lo que hay, «referencia» es lo que decía el Excel.
 */
function BadgeStock({ stock, enVivo }: { stock: number | null | undefined; enVivo?: boolean }) {
  if (stock === null || stock === undefined) {
    return <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">stock s/d</span>;
  }
  if (stock === 0) {
    return (
      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
        {enVivo ? "sin stock en almacén" : "sin stock"}
      </span>
    );
  }
  return (
    <span
      title={enVivo ? "Máquinas en el almacén, contadas por su número de serie" : "Cifra de referencia del maestro, no un conteo del almacén"}
      className="rounded-full bg-[#1E7F4F]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#1E7F4F]"
    >
      {stock} {enVivo ? "en almacén" : "en stock (ref.)"}
    </span>
  );
}

function Miniatura({ equipo, grande = false, src }: { equipo: EquipoElegible; grande?: boolean; src?: string | null }) {
  const foto = src ?? equipo.fotoPath;
  if (!foto) {
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
      src={foto}
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
  colorElegido,
  onElegirColor,
  onQuitar,
}: {
  equipo: EquipoElegible | null;
  unidades: number;
  /** El color con el que este equipo YA está en la cotización, si está. */
  colorElegido: string | null;
  onElegirColor?: (productoId: string, color: string) => void;
  onQuitar: (productoId: string) => void;
}) {
  // Coches de transporte: el mismo código se fabrica en varios colores y cada
  // uno tiene su foto (un Word por color, 27-08). Se mira pasando el mouse por
  // la miniatura, sin clic — igual que el resto de este buscador. Se guarda de
  // qué equipo era el color elegido para que al pasar al siguiente vuelva solo
  // a su foto principal, sin un efecto que reinicie el estado.
  const [colorVisto, setColorVisto] = useState<{ equipoId: string; color: string } | null>(null);
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
    // En LG la misma máquina viene apilable y no apilable: es lo único que las
    // distingue, y el comercial tiene que verlo antes de agregarla.
    equipo.montaje && ["Montaje", equipo.montaje],
    equipo.calentamiento && ["Calentamiento", equipo.calentamiento],
    equipo.panel && ["Panel", equipo.panel],
    equipo.controles && ["Voltaje", equipo.controles],
    equipo.colores && equipo.colores.length > 0 && ["Color", equipo.colores.join(" / ")],
    materialTambor(equipo.caracteristicas) && ["Tambor", materialTambor(equipo.caracteristicas)],
  ].filter(Boolean) as [string, string][];
  const fotosPorColor = Object.entries(equipo.fotosPorColor ?? {});
  // Qué foto se está viendo: la del color bajo el mouse; si no se está mirando
  // ninguno, la del color YA elegido para la cotización; si tampoco, la primera.
  const colorEnPantalla =
    colorVisto?.equipoId === equipo.id ? colorVisto.color : (colorElegido ?? fotosPorColor[0]?.[0] ?? null);
  return (
    <div className="hidden h-full flex-col gap-2 overflow-y-auto sm:flex">
      <Miniatura
        equipo={equipo}
        grande
        src={(colorEnPantalla && equipo.fotosPorColor?.[colorEnPantalla]) || equipo.fotoPath}
      />
      {/* Las fotos de cada color, cuando el equipo se fabrica en más de uno.
          Pasar el mouse muestra ese color en grande; el CLIC lo elige, y desde
          ahí viaja al ítem de la cotización y al PDF (migración 0088). Antes
          solo cambiaba la vista previa y la elección se perdía al agregar el
          equipo — reportado el 27-08: «selecciono blanco y no aparece en el
          PDF». */}
      {fotosPorColor.length > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {fotosPorColor.map(([color, ruta]) => (
            <button
              key={color}
              type="button"
              title={`Cotizar el ${equipo.modelo} en ${color}`}
              onMouseEnter={() => setColorVisto({ equipoId: equipo.id, color })}
              onFocus={() => setColorVisto({ equipoId: equipo.id, color })}
              onClick={(e) => {
                e.stopPropagation();
                onElegirColor?.(equipo.id, color);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-md border px-1 py-0.5 text-[10px] font-medium transition-colors",
                colorElegido === color
                  ? "border-primary bg-primary/10 text-primary"
                  : colorEnPantalla === color
                    ? "border-border bg-secondary text-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- foto local chica */}
              <img src={ruta} alt="" loading="lazy" className="size-7 rounded bg-white object-contain" />
              {color}
              {colorElegido === color && <Check className="size-3" />}
            </button>
          ))}
        </div>
      )}
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
        <BadgeStock stock={equipo.stock} enVivo={equipo.stockEnVivo} />
      </div>
      {/* El estado del equipo en la cotización. El «quitar» también está acá
          —es donde mira quien está inspeccionando el equipo— pero desde el
          27-08 el de verdad vive en la propia fila, junto a las unidades: en
          este panel pasaba desapercibido. */}
      {unidades > 0 && (
        <div className="flex items-center justify-between rounded-md bg-primary/10 px-2 py-1.5">
          <span className="text-xs font-semibold text-primary">En la cotización: ×{unidades}</span>
          <button
            type="button"
            onClick={() => onQuitar(equipo.id)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-destructive/30 px-1.5 py-0.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <X className="size-3" />
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
  onQuitar,
}: {
  unidades: number;
  onSumar: () => void;
  onRestar: () => void;
  onQuitar: () => void;
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
      {/* Sacar el equipo entero, al lado de donde se cambian las unidades
          (27-08). Vivía solo en el panel de la derecha y ahí no se veía: para
          deshacerse de un equipo con 3 unidades había que apretar «−» tres
          veces o descubrir el botón del previsualizador. */}
      <span className="mx-0.5 h-4 w-px bg-primary/25" />
      <button
        type="button"
        aria-label="Quitar el equipo de la cotización"
        title="Quitar el equipo de la cotización"
        className="flex size-6 cursor-pointer items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
        onClick={onQuitar}
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

export function BuscadorEquiposModal({
  productos,
  enCarrito,
  coloresEnCarrito,
  onElegirColor,
  onAgregar,
  onRestar,
  onQuitar,
  abrirAlEntrar = false,
}: {
  productos: EquipoElegible[];
  /** producto_id → unidades ya en la cotización, para los badges. */
  enCarrito: Record<string, number>;
  /** producto_id → color con el que ya está en la cotización. */
  coloresEnCarrito?: Record<string, string>;
  /** Elige el color de un equipo: lo agrega con ese color si no estaba, o le
   *  cambia el color si ya estaba (sin sumar otra unidad). */
  onElegirColor?: (productoId: string, color: string) => void;
  /** Suma una unidad (o agrega el equipo si no estaba). */
  onAgregar: (p: EquipoElegible) => void;
  /** Resta una unidad; en 1, quita el equipo. */
  onRestar: (productoId: string) => void;
  onQuitar: (productoId: string) => void;
  /** Se abre solo al montar. En una cotización nueva y vacía, buscar el primer
   *  equipo es lo ÚNICO que se puede hacer: pedir un clic para llegar ahí es
   *  pedirlo por nada. */
  abrirAlEntrar?: boolean;
}) {
  const [abierto, setAbierto] = useState(abrirAlEntrar);
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
      {/* La puerta a la ventana grande. Parecía un campo de formulario más y en
          la pantalla del cotizador se perdía entre los paneles (27-08), cuando
          es LA acción de esa pantalla: sin equipos no hay cotización. Ahora es
          una tarjeta con halo, y el halo late solo mientras la cotización está
          vacía — cumplido su trabajo, se calma y deja de pedir atención. */}
      <div className="relative">
        {totalEquipos === 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1 rounded-2xl bg-primary/25 blur-md motion-safe:animate-pulse"
          />
        )}
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className={cn(
            "relative flex h-14 w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 text-left transition-all",
            totalEquipos === 0
              ? "border-primary ring-4 ring-primary/15 hover:ring-primary/30"
              : "border-primary/40 hover:border-primary hover:bg-accent",
          )}
          aria-haspopup="dialog"
        >
          <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Search className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Buscar y agregar equipos</span>
            <span className="block truncate text-xs text-muted-foreground">
              Código, marca, capacidad o como lo pide el cliente: «secadora a gas», «rodillo eléctrico»…
            </span>
          </span>
          {totalEquipos > 0 && (
            <span className="flex-none rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {totalEquipos} en la cotización
            </span>
          )}
        </button>
      </div>

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
                  {/* Es un div y no un <button> porque adentro lleva los suyos
                      —las unidades y el quitar—, y un botón dentro de otro es
                      HTML inválido: el navegador puede tragarse el clic del de
                      adentro. El teclado no pierde nada: se navega con las
                      flechas desde el buscador, no tabulando la lista. */}
                  <div
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
                          onQuitar={() => onQuitar(p.id)}
                        />
                      )}
                      <BadgeStock stock={p.stock} enVivo={p.stockEnVivo} />
                    </span>
                  </div>
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
              colorElegido={enFoco ? (coloresEnCarrito?.[enFoco.id] ?? null) : null}
              onElegirColor={onElegirColor}
              onQuitar={onQuitar}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Clic o Enter agregan el equipo; las unidades se cambian con − y +, y ✕ lo quita. El stock es el de la
              CODIFICACIÓN de Lesly, no un inventario en vivo.
            </p>
            {/* «Listo (4 equipos)» describía un trámite, no el paso siguiente
                (27-08). Lo que de verdad pasa al apretarlo es volver a la
                cotización con los equipos puestos, así que eso dice — y con el
                número adelante, porque es la cuenta que la comercial quiere
                confirmar antes de salir. Sin equipos no hay nada que continuar:
                ahí es un «Cerrar» discreto. */}
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className={cn(
                "group/continuar flex flex-none cursor-pointer items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all",
                totalEquipos > 0
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/40"
                  : "border border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {totalEquipos > 0 ? (
                <>
                  <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs tabular-nums">
                    {totalEquipos}
                  </span>
                  Continuar con la cotización
                  <ArrowRight className="size-4 transition-transform group-hover/continuar:translate-x-0.5" />
                </>
              ) : (
                "Cerrar"
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
