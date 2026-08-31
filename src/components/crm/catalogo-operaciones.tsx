"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Boxes, Plus, Search, TriangleAlert } from "lucide-react";
import { buscarEquipos } from "@/lib/buscar-equipo";
import { rutaFoto } from "@/lib/foto-producto";
import { AccionesEquipo } from "@/components/crm/acciones-equipo";
import type { EquipoCatalogo, SaludCatalogo } from "@/lib/catalogo-operaciones";
import { FichaTecnicaEditor, EQUIPO_NUEVO, type EquipoEditable } from "@/components/crm/ficha-tecnica-editor";
import { SubirFichaWord } from "@/components/crm/subir-ficha-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * El catálogo, que es también el almacén.
 *
 * «Se supone que el catálogo es el almacén y solo se ven productos que tenemos
 * en SKU, y puede haber stock o no haber stock, y ahí debe salir» (28-08). Una
 * pantalla aparte llamada «almacén» era inventarle un lugar nuevo a un dato que
 * es del equipo: el stock es una línea más de la tarjeta, como el precio, y se
 * ve siempre —«sin stock» también es una respuesta—.
 *
 * SE BUSCA COMO BUSCA EL COMERCIAL: `buscarEquipos()` es la misma función del
 * cotizador, no una parecida. Si acá no sale, a él tampoco le sale.
 *
 * Y SE ABRE HACIENDO CLIC EN EL EQUIPO. Lo que se abre no es un formulario: es
 * la hoja técnica tal como sale impresa, editable encima.
 */
export function CatalogoOperaciones({ equipos, salud }: { equipos: EquipoCatalogo[]; salud: SaludCatalogo }) {
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<Filtro>({ tipo: "todas" });
  const [abierto, setAbierto] = useState<EquipoEditable | null>(null);
  // El que se acaba de cargar: sube al principio y se resalta un rato. Sin
  // esto, un equipo nuevo cae en su lugar alfabético entre ciento veinte y
  // hay que ir a buscarlo (reportado 28-08: «ahora se me perdió y no lo veo»).
  const [recienCargado, setRecienCargado] = useState<string | null>(null);

  const activos = useMemo(() => equipos.filter((e) => e.activo), [equipos]);

  const categorias = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of activos) {
      const k = (e.categoria ?? "sin categoría").toLowerCase();
      c.set(k, (c.get(k) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [activos]);

  const conteos = useMemo(
    () => ({
      sinStock: activos.filter((e) => stockDe(e).cantidad === 0).length,
      incompletos: activos.filter(incompleto).length,
    }),
    [activos],
  );

  const resultados = useMemo(() => {
    const lista = filtro.tipo === "fuera" ? equipos.filter((e) => !e.activo) : activos;
    const filtrada =
      filtro.tipo === "categoria"
        ? lista.filter((e) => (e.categoria ?? "sin categoría").toLowerCase() === filtro.valor)
        : filtro.tipo === "incompletos"
          ? lista.filter(incompleto)
          : filtro.tipo === "con_stock"
            ? lista.filter((e) => stockDe(e).cantidad > 0)
            : filtro.tipo === "sin_stock"
              ? lista.filter((e) => stockDe(e).cantidad === 0)
              : lista;
    const encontrados = buscarEquipos(filtrada, texto);
    // El recién cargado va primero, esté donde esté en el orden.
    if (!recienCargado) return encontrados;
    const nuevo = encontrados.find((e) => e.id === recienCargado);
    return nuevo ? [nuevo, ...encontrados.filter((e) => e.id !== recienCargado)] : encontrados;
  }, [equipos, activos, texto, filtro, recienCargado]);

  const enAlmacen = activos.reduce((a, e) => a + stockDe(e).cantidad, 0);

  return (
    <div className="space-y-4">
      {/* Lo que está mal, arriba: un catálogo se mantiene por sus huecos, y un
          hueco no aparece nunca en una lista de lo que hay. */}
      {(salud.categoriasRepetidas.length > 0 || salud.sinPrecio > 0 || salud.sinFicha > 0 || salud.sinFoto > 0) && (
        <div className="space-y-2 rounded-lg border-2 border-amber-300 bg-amber-50/70 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">
            <TriangleAlert className="size-3.5" /> Revisar
          </p>
          {salud.categoriasRepetidas.map((c) => (
            <p key={c.normalizada} className="text-xs leading-snug text-amber-900">
              <strong>{c.formas.join(" y ")}</strong> son la misma categoría escrita de dos formas — {c.equipos} equipos
              repartidos entre las dos. Cualquier filtro por categoría los va a separar.
            </p>
          ))}
          {salud.sinPrecio > 0 && (
            <button
              type="button"
              onClick={() => setFiltro({ tipo: "incompletos" })}
              className="block text-left text-xs text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
            >
              {salud.sinPrecio}
              {salud.sinPrecio === 1 ? " equipo activo sin precio vigente" : " equipos activos sin precio vigente"}: el
              comercial los encuentra y no los puede cotizar. Pulse para verlos.
            </button>
          )}
          {salud.sinFicha > 0 && (
            <p className="text-xs text-amber-900">
              {salud.sinFicha} sin ficha: salen en la cotización sin especificaciones.
            </p>
          )}
          {salud.sinFoto > 0 && <p className="text-xs text-amber-900">{salud.sinFoto} sin foto.</p>}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[280px] flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Busque como buscaría un comercial: «secadora eléctrica primus», «rx135», «coche azul»…"
              className="pl-8"
            />
          </div>
          <Button size="sm" onClick={() => setAbierto(EQUIPO_NUEVO)}>
            <Plus className="size-3.5" /> Cargar un equipo
          </Button>
          {/* EL ATAJO PARA LOS QUE YA TIENEN FICHA. Casi todo lo que Lesly
              carga ya está escrito en un Word suyo: escribirlo otra vez a mano
              es copiar cuarenta líneas y equivocarse en alguna. Arrastra el
              archivo y la hoja abre llena (Santos, 31-08). */}
          <SubirFichaWord onLeida={setAbierto} />
        </div>

        {/* UN FILTRO A LA VEZ.
            Antes se podían encender varios —categoría, con stock, incompletos,
            inactivos— y el resultado era una intersección que nadie pedía: se
            marcaba «coche» y «con stock» y salía vacío sin que quedara claro
            cuál de los dos filtraba. Ahora es una sola pregunta a la vez, y
            volver a pulsar la apaga. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Pastilla activa={filtro.tipo === "todas"} onClick={() => setFiltro({ tipo: "todas" })}>
            Todas {activos.length}
          </Pastilla>
          {categorias.map(([c, n]) => (
            <Pastilla
              key={c}
              activa={filtro.tipo === "categoria" && filtro.valor === c}
              onClick={() => setFiltro(filtro.tipo === "categoria" && filtro.valor === c ? { tipo: "todas" } : { tipo: "categoria", valor: c })}
            >
              {c} {n}
            </Pastilla>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <Pastilla
            activa={filtro.tipo === "con_stock"}
            onClick={() => setFiltro(filtro.tipo === "con_stock" ? { tipo: "todas" } : { tipo: "con_stock" })}
            titulo="Los que se pueden prometer hoy"
          >
            <Boxes className="mr-1 inline size-3" />
            Con stock {enAlmacen}
          </Pastilla>
          <Pastilla
            activa={filtro.tipo === "sin_stock"}
            onClick={() => setFiltro(filtro.tipo === "sin_stock" ? { tipo: "todas" } : { tipo: "sin_stock" })}
            titulo="Para encontrarlos y actualizarles la cantidad"
          >
            Sin stock {conteos.sinStock}
          </Pastilla>
          <Pastilla
            activa={filtro.tipo === "incompletos"}
            onClick={() => setFiltro(filtro.tipo === "incompletos" ? { tipo: "todas" } : { tipo: "incompletos" })}
            titulo="Sin precio, sin ficha o sin foto"
          >
            Incompletos {conteos.incompletos}
          </Pastilla>
          <Pastilla
            activa={filtro.tipo === "fuera"}
            onClick={() => setFiltro(filtro.tipo === "fuera" ? { tipo: "todas" } : { tipo: "fuera" })}
            titulo="Apagados en su momento —versiones viejas del mismo equipo, o modelos que se dejaron de traer—. El comercial no los ve; desde acá se pueden volver a prender."
          >
            Fuera del catálogo {salud.inactivos}
          </Pastilla>
        </div>

        <p className="text-xs text-muted-foreground">
          {resultados.length === activos.length
            ? `${resultados.length} equipos`
            : `${resultados.length} de ${activos.length}`}
          {texto.trim() && resultados.length === 0 && " — si acá no sale, al comercial tampoco le sale."}
        </p>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        {resultados.map((e) => (
          <TarjetaEquipo
            key={e.id}
            equipo={e}
            nueva={e.id === recienCargado}
            onAbrir={() => setAbierto(aEditable(e))}
            onDuplicar={() => setAbierto(duplicado(e))}
          />
        ))}
      </div>

      <Dialog open={abierto !== null} onOpenChange={(v) => !v && setAbierto(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {abierto?.duplicadoDe
                ? `Duplicado de ${abierto.duplicadoDe} — sin guardar`
                : abierto?.id === null
                  ? "Cargar un equipo al catálogo"
                  : `${abierto?.marca} ${abierto?.modelo} — así sale impreso`}
            </DialogTitle>
          </DialogHeader>
          {abierto && (
            <FichaTecnicaEditor
              equipo={abierto}
              onListo={(id) => {
                setAbierto(null);
                if (id) {
                  setFiltro({ tipo: "todas" });
                  setTexto("");
                  setRecienCargado(id);
                  window.setTimeout(() => setRecienCargado(null), 12000);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Filtro =
  | { tipo: "todas" }
  | { tipo: "categoria"; valor: string }
  | { tipo: "con_stock" }
  | { tipo: "sin_stock" }
  | { tipo: "incompletos" }
  | { tipo: "fuera" };

/** Le falta algo para poder cotizarse: precio, ficha o foto. */
function incompleto(e: EquipoCatalogo): boolean {
  return e.precios.length === 0 || !e.tieneFicha || !e.fotoPath;
}

/**
 * La copia de un equipo, lista para editarse: sin id —así se guarda como uno
 * nuevo—, sin código y sin foto, que son de la máquina y no de la plantilla.
 * El nombre avisa que es una copia, para que no se guarde igual sin querer.
 */
function duplicado(e: EquipoCatalogo): EquipoEditable {
  return {
    ...aEditable(e),
    id: null,
    sku: null,
    fotoPath: null,
    nombre: `${e.nombre} (copia)`,
    duplicadoDe: `${e.marca} ${e.modelo}`,
    disponibles: null,
    // El stock es de la máquina, no de la plantilla: se copia la ficha, no las
    // unidades que hay en planta. Heredarlo publicaría en el cotizador un
    // «hay 12» de un modelo que todavía no existe.
    stockReferencia: null,
  };
}

function aEditable(e: EquipoCatalogo): EquipoEditable {
  return {
    id: e.id,
    nombre: e.nombre,
    marca: e.marca,
    modelo: e.modelo,
    sku: e.sku,
    categoria: e.categoria,
    capacidad: e.capacidad,
    segmento: e.segmento,
    activo: e.activo,
    calentamiento: e.calentamiento,
    panel: e.panel,
    controles: e.controles,
    montaje: e.montaje,
    colores: e.colores,
    fotoPath: e.fotoPath,
    fichaTexto: e.fichaTexto,
    precios: e.precios,
    disponibles: e.disponibles,
    stockReferencia: e.stockReferencia,
    ubicacionMaestro: e.ubicacionMaestro,
  };
}

/**
 * Cuántas hay de este equipo, y de dónde sale el número.
 *
 * La misma regla del cotizador (`datos-cotizador.ts`), para que las dos
 * pantallas digan lo mismo: el almacén manda donde está cargado; donde no,
 * se muestra la cifra del maestro rotulada como referencia. Decir «sin
 * stock» por un almacén a medio cargar sería peor que no decir nada.
 */
function stockDe(e: EquipoCatalogo): { cantidad: number; etiqueta: string; titulo: string } {
  if (e.disponibles !== null) {
    return {
      cantidad: e.disponibles,
      etiqueta: e.disponibles > 0 ? `${e.disponibles} en almacén` : "sin stock en almacén",
      titulo: "Máquinas del almacén, contadas por su número de serie",
    };
  }
  if (e.stockReferencia !== null) {
    return {
      cantidad: e.stockReferencia,
      etiqueta: e.stockReferencia > 0 ? `${e.stockReferencia} en stock (ref.)` : "sin stock (ref.)",
      titulo: `Cifra del maestro${e.ubicacionMaestro ? ` — ${e.ubicacionMaestro}` : ""}, no un conteo del almacén`,
    };
  }
  return { cantidad: 0, etiqueta: "stock sin cargar", titulo: "Ni el almacén ni el maestro dicen cuántas hay" };
}

function Pastilla({
  activa,
  onClick,
  titulo,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  titulo?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors",
        activa ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function TarjetaEquipo({
  equipo: e,
  nueva = false,
  onAbrir,
  onDuplicar,
}: {
  equipo: EquipoCatalogo;
  /** Recién cargado: sube al principio y se resalta hasta que se lo vea. */
  nueva?: boolean;
  onAbrir: () => void;
  onDuplicar: () => void;
}) {
  const falta = incompleto(e);
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onAbrir()}
      title="Abrir la ficha para verla o corregirla"
      className={cn(
        "group flex cursor-pointer gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/40",
        nueva
          ? "border-primary bg-primary/5 ring-2 ring-primary/30 motion-safe:animate-pulse"
          : !e.activo
            ? "border-dashed border-border bg-secondary/30"
            : falta
              ? "border-amber-300"
              : "border-border",
      )}
    >
      {/* La foto que va a salir impresa. Verla acá evita el caso de la foto
          equivocada, que solo se descubría con el PDF ya enviado. */}
      <div className="size-20 flex-none overflow-hidden rounded-md border border-border bg-white">
        {e.fotoPath ? (
          <Image
            src={rutaFoto(e.fotoPath)}
            alt={`${e.marca} ${e.modelo}`}
            width={80}
            height={80}
            className="size-full object-contain"
            unoptimized
          />
        ) : (
          <span className="flex size-full items-center justify-center text-[10px] text-muted-foreground">sin foto</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-foreground">
            {e.marca} {e.modelo}
          </span>
          {e.sku && <span className="font-mono text-[10px] text-muted-foreground">{e.sku}</span>}
          {nueva && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold uppercase text-primary-foreground">
              recién cargado
            </span>
          )}
          {!e.activo && (
            <span className="rounded-full bg-foreground/10 px-1.5 text-[10px] font-bold uppercase text-muted-foreground">
              fuera del catálogo
            </span>
          )}
          <span className="ml-auto">
            <AccionesEquipo
              nombre={`${e.marca} ${e.modelo}`}
              equipoId={e.id}
              onEditar={onAbrir}
              onDuplicar={onDuplicar}
            />
          </span>
        </p>
        <p className="truncate text-xs text-muted-foreground">{e.nombre}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
          {e.categoria && <span className="capitalize">{e.categoria}</span>}
          <span>{e.segmento.replace("_", "-")}</span>
          {e.capacidad && <span>{e.capacidad}</span>}
          {e.calentamiento && <span>{e.calentamiento}</span>}
          {e.montaje && <span>{e.montaje}</span>}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {e.precios.length === 0 ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700">
              <AlertTriangle className="size-3" /> sin precio
            </span>
          ) : (
            e.precios.map((p) => (
              <span key={p.tier} className="text-[11px] tabular-nums text-foreground">
                <span className="capitalize text-muted-foreground">{p.tier}</span> {p.precio.toLocaleString("es-PE")}
              </span>
            ))
          )}

          {/* EL STOCK, EL MISMO NÚMERO QUE VE EL COMERCIAL.

              Hasta hoy acá decía «stock sin cargar» para todos —porque el
              almacén del CRM está vacío— mientras el cotizador mostraba
              «8 en stock» para 84 equipos. Dos pantallas de la misma
              empresa contestando distinto la misma pregunta.

              El número es uno: manda el almacén donde esté cargado, y
              donde no, la cifra del maestro. Lo que cambia es el rótulo,
              porque no son lo mismo: «en almacén» son máquinas contadas
              por su serie; «(ref.)» es lo que decía el Excel el día que
              se cargó. */}
          <span
            title={stockDe(e).titulo}
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              stockDe(e).cantidad > 0 ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-secondary text-muted-foreground",
            )}
          >
            {stockDe(e).etiqueta}
          </span>

          {!e.tieneFicha && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700">
              <AlertTriangle className="size-3" /> sin ficha
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
