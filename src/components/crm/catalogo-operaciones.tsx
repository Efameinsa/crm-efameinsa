"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Boxes, FileText, Plus, Search, TriangleAlert } from "lucide-react";
import { buscarEquipos, retiradosQueCoinciden } from "@/lib/buscar-equipo";
import { textoABloques } from "@/lib/ficha-texto";
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
export function CatalogoOperaciones({
  equipos,
  salud,
  soloLectura = false,
}: {
  equipos: EquipoCatalogo[];
  salud: SaludCatalogo;
  /**
   * LA VISTA DEL ALMACÉN (Lesly, 06-10): «que almacén tenga la vista de
   * catálogo solo para ver la información, mas no para subir o editar». La
   * misma pantalla —el mismo buscador, los mismos filtros, la misma tarjeta—
   * sin lo que sirve para mantenerla: ni cargar, ni subir el Word, ni el ⋮, ni
   * los avisos de lo incompleto. La ficha abre para leerse, no editable. Las
   * acciones de servidor también lo rechazan (`acciones/productos.ts`).
   */
  soloLectura?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<Filtro>({ tipo: "todas" });
  const [abierto, setAbierto] = useState<EquipoEditable | null>(null);
  const [consultado, setConsultado] = useState<EquipoCatalogo | null>(null);
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

  // LO QUE SE BUSCA Y ESTÁ APAGADO. El buscador mira solo los activos —es el
  // catálogo que ve el comercial—, pero contestar «sin resultados» cuando el
  // equipo existe retirado termina en que se carga otra vez a mano: así nacieron
  // tres copias sin código de la misma SECU75E3, y una se cotizó a un cliente
  // (10-09). El vacío dice qué falta, por qué está fuera y con qué botón se
  // llega hasta él.
  const retirados = useMemo(
    () => retiradosQueCoinciden(equipos, texto, resultados.length > 0),
    [equipos, texto, resultados.length],
  );

  const enAlmacen = activos.reduce((a, e) => a + stockDe(e).cantidad, 0);

  return (
    <div className="space-y-4">
      {/* Lo que está mal, arriba: un catálogo se mantiene por sus huecos, y un
          hueco no aparece nunca en una lista de lo que hay. */}
      {!soloLectura && (salud.categoriasRepetidas.length > 0 || salud.sinPrecio > 0 || salud.sinFicha > 0 || salud.sinFoto > 0) && (
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
          {!soloLectura && (
            <Button size="sm" onClick={() => setAbierto(EQUIPO_NUEVO)}>
              <Plus className="size-3.5" /> Cargar un equipo
            </Button>
          )}
          {/* EL ATAJO PARA LOS QUE YA TIENEN FICHA. Casi todo lo que Lesly
              carga ya está escrito en un Word suyo: escribirlo otra vez a mano
              es copiar cuarenta líneas y equivocarse en alguna. Arrastra el
              archivo y la hoja abre llena (Santos, 31-08). */}
          {!soloLectura && <SubirFichaWord onLeida={setAbierto} />}
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
            titulo={soloLectura ? "Los que hoy no se pueden prometer" : "Para encontrarlos y actualizarles la cantidad"}
          >
            Sin stock {conteos.sinStock}
          </Pastilla>
          {/* Incompletos y apagados son trabajo de quien mantiene el catálogo. */}
          {!soloLectura && (
          <>
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
          </>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {resultados.length === activos.length
            ? `${resultados.length} equipos`
            : `${resultados.length} de ${activos.length}`}
          {texto.trim() && resultados.length === 0 && " — si acá no sale, al comercial tampoco le sale."}
        </p>

        {!soloLectura && filtro.tipo !== "fuera" && retirados.length > 0 && (
          <div className="rounded-lg border border-dashed border-border bg-secondary/40 p-3 text-xs leading-snug text-muted-foreground">
            <p>
              {resultados.length === 0
                ? `Ninguno de los ${activos.length} equipos del catálogo coincide con «${texto.trim()}», pero `
                : "Además, "}
              {retirados.length === 1 ? "hay uno FUERA del catálogo" : `hay ${retirados.length} FUERA del catálogo`}:{" "}
              <span className="font-medium text-foreground">
                {retirados
                  .slice(0, 3)
                  .map((e) => `${e.sku ?? e.nombre} (${e.marca} ${e.modelo})`)
                  .join(", ")}
                {retirados.length > 3 && ` y ${retirados.length - 3} más`}
              </span>
              {retirados.length === 1
                ? ". Se apagó en su momento —una versión vieja del mismo equipo, o un modelo que se dejó de traer— y el comercial no lo ve, pero conserva su ficha, su precio y sus fotos."
                : ". Se apagaron en su momento —versiones viejas del mismo equipo, o modelos que se dejaron de traer— y el comercial no los ve, pero conservan su ficha, su precio y sus fotos."}
            </p>
            <button
              type="button"
              onClick={() => setFiltro({ tipo: "fuera" })}
              className="mt-1.5 cursor-pointer font-medium text-foreground underline decoration-border underline-offset-2 hover:text-primary"
            >
              Verlos acá — se abren y se vuelven a prender desde «En el catálogo» →
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        {resultados.map((e) => (
          <TarjetaEquipo
            key={e.id}
            equipo={e}
            nueva={e.id === recienCargado}
            soloLectura={soloLectura}
            onAbrir={() => (soloLectura ? setConsultado(e) : setAbierto(aEditable(e)))}
            onDuplicar={() => setAbierto(duplicado(e))}
          />
        ))}
      </div>

      {/* La ficha para leer: lo que abre el almacén al pulsar un equipo. */}
      <Dialog open={consultado !== null} onOpenChange={(v) => !v && setConsultado(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {consultado?.marca} {consultado?.modelo}
            </DialogTitle>
          </DialogHeader>
          {consultado && <FichaConsulta equipo={consultado} />}
        </DialogContent>
      </Dialog>

      <Dialog open={abierto !== null} onOpenChange={(v) => !v && setAbierto(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {abierto?.duplicadoDe
                ? `Duplicado de ${abierto.duplicadoDe} — sin guardar`
                : // DE QUÉ WORD SALIÓ. Una ficha leída de un archivo equivocado
                  // abre igual de llena y de creíble que la correcta: lo único
                  // que delata el error es el nombre del archivo, así que va en
                  // el título y no escondido adentro (Santos, 31-08).
                  abierto?.leidaDe
                  ? `Leída de ${abierto.leidaDe} — sin guardar`
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
  // Un servicio no lleva foto ni stock: le basta precio y ficha (25-09).
  return e.precios.length === 0 || !e.tieneFicha || (!e.fotoPath && e.segmento !== "servicio");
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
    logoPath: null,
    panelPath: null,
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
    // Las casillas propias de este equipo, con su rótulo (0199).
    encabezadoExtra: e.encabezadoExtra ?? [],
    fotoPath: e.fotoPath,
    logoPath: e.logoPath,
    panelPath: e.panelPath,
    logoUrl: e.logoPath ? rutaFoto(e.logoPath) : null,
    panelUrl: e.panelPath ? rutaFoto(e.panelPath) : null,
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
  soloLectura = false,
  onAbrir,
  onDuplicar,
}: {
  equipo: EquipoCatalogo;
  /** Almacén: la tarjeta abre la ficha para leerla y no lleva el ⋮. */
  soloLectura?: boolean;
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
      title={soloLectura ? "Abrir la ficha" : "Abrir la ficha para verla o corregirla"}
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
          {!soloLectura && (
            <span className="ml-auto">
              <AccionesEquipo
                nombre={`${e.marca} ${e.modelo}`}
                equipoId={e.id}
                onEditar={onAbrir}
                onDuplicar={onDuplicar}
              />
            </span>
          )}
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
          {e.segmento !== "servicio" && (
            <span
              title={stockDe(e).titulo}
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                stockDe(e).cantidad > 0 ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-secondary text-muted-foreground",
              )}
            >
              {stockDe(e).etiqueta}
            </span>
          )}

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

/**
 * La ficha de un equipo para LEERLA (vista del almacén, 06-10): la foto, la
 * cabecera, el precio, el stock y la descripción tal como se imprime. Sin un
 * solo campo editable; el PDF abre la hoja que recibe el cliente.
 */
function FichaConsulta({ equipo: e }: { equipo: EquipoCatalogo }) {
  const bloques = textoABloques(e.fichaTexto);
  const stock = stockDe(e);
  const cabecera: [string, string | null][] = [
    ["Código", e.sku],
    ["Categoría", e.categoria],
    ["Segmento", e.segmento.replace("_", "-")],
    ["Capacidad", e.capacidad],
    ["Calentamiento", e.calentamiento],
    ["Panel", e.panel],
    ["Controles", e.controles],
    ["Montaje", e.montaje],
    ["Colores", e.colores.length ? e.colores.join(", ") : null],
    ...e.encabezadoExtra.map((x): [string, string | null] => [x.rotulo, x.valor || null]),
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="size-48 flex-none self-center overflow-hidden rounded-md border border-border bg-white sm:self-start">
          {e.fotoPath ? (
            <Image
              src={rutaFoto(e.fotoPath)}
              alt={`${e.marca} ${e.modelo}`}
              width={192}
              height={192}
              className="size-full object-contain"
              unoptimized
            />
          ) : (
            <span className="flex size-full items-center justify-center text-xs text-muted-foreground">sin foto</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-muted-foreground">{e.nombre}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {cabecera
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-semibold text-muted-foreground">{k}</dt>
                  <dd className="text-foreground">{v}</dd>
                </div>
              ))}
          </dl>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
            {e.precios.length === 0 ? (
              <span className="text-xs font-semibold text-amber-700">sin precio</span>
            ) : (
              e.precios.map((p) => (
                <span key={p.tier} className="text-xs tabular-nums text-foreground">
                  <span className="capitalize text-muted-foreground">Precio {p.tier}</span>{" "}
                  {p.precio.toLocaleString("es-PE")}
                </span>
              ))
            )}
            {e.segmento !== "servicio" && (
              <span
                title={stock.titulo}
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  stock.cantidad > 0 ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-secondary text-muted-foreground",
                )}
              >
                {stock.etiqueta}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        {bloques.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Este equipo no tiene ficha cargada: la cotización sale sin especificaciones. Avise a operaciones.
          </p>
        ) : (
          <div className="space-y-1 text-xs leading-relaxed text-foreground">
            {bloques.map((b, i) =>
              b.t === "titulo" ? (
                <p key={i} className="pt-1 text-sm font-bold">
                  {b.texto}
                </p>
              ) : b.t === "subtitulo" ? (
                <p key={i} className="pt-1 font-semibold">
                  {b.texto}
                </p>
              ) : b.t === "dato" ? (
                <p key={i}>
                  <span className="font-semibold">{b.rotulo}:</span> {b.valor}
                </p>
              ) : (
                <p key={i} className="pl-3 -indent-3">
                  • {b.texto}
                </p>
              ),
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/productos/${e.id}/vista-previa`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          <FileText className="size-3.5" /> Ver el PDF, Efameinsa
        </a>
        <a
          href={`/api/productos/${e.id}/vista-previa?serie=OPEN`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          <FileText className="size-3.5" /> en Open
        </a>
        <span className="text-[11px] text-muted-foreground">Solo consulta: los cambios los hace operaciones.</span>
      </div>
    </div>
  );
}
