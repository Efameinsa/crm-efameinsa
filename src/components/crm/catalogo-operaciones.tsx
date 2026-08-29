"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Boxes, Plus, Search, TriangleAlert } from "lucide-react";
import { buscarEquipos } from "@/lib/buscar-equipo";
import type { EquipoCatalogo, SaludCatalogo } from "@/lib/catalogo-operaciones";
import { FichaTecnicaEditor, EQUIPO_NUEVO, type EquipoEditable } from "@/components/crm/ficha-tecnica-editor";
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
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [soloConStock, setSoloConStock] = useState(false);
  const [verInactivos, setVerInactivos] = useState(false);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<EquipoEditable | null>(null);

  const categorias = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of equipos) {
      if (!e.activo && !verInactivos) continue;
      const k = (e.categoria ?? "sin categoría").toLowerCase();
      c.set(k, (c.get(k) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [equipos, verInactivos]);

  const problema = (e: EquipoCatalogo) => e.precios.length === 0 || !e.tieneFicha || !e.fotoPath;

  const resultados = useMemo(() => {
    let lista = equipos.filter((e) => (verInactivos ? true : e.activo));
    if (categoria) lista = lista.filter((e) => (e.categoria ?? "sin categoría").toLowerCase() === categoria);
    if (soloProblemas) lista = lista.filter(problema);
    if (soloConStock) lista = lista.filter((e) => (e.disponibles ?? 0) > 0);
    return buscarEquipos(lista, texto);
  }, [equipos, texto, soloProblemas, soloConStock, verInactivos, categoria]);

  const enAlmacen = equipos.reduce((a, e) => a + (e.disponibles ?? 0), 0);

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
            <p className="text-xs text-amber-900">
              {salud.sinPrecio} equipos activos sin precio vigente: el comercial los encuentra y no los puede cotizar.
            </p>
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
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Pastilla activa={categoria === null} onClick={() => setCategoria(null)}>
            Todas
          </Pastilla>
          {categorias.map(([c, n]) => (
            <Pastilla key={c} activa={categoria === c} onClick={() => setCategoria(categoria === c ? null : c)}>
              {c} {n}
            </Pastilla>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <Pastilla activa={soloConStock} onClick={() => setSoloConStock(!soloConStock)}>
            <Boxes className="mr-1 inline size-3" />
            Con stock {enAlmacen > 0 ? enAlmacen : ""}
          </Pastilla>
          <Pastilla activa={soloProblemas} onClick={() => setSoloProblemas(!soloProblemas)}>
            Solo incompletos
          </Pastilla>
          <Pastilla activa={verInactivos} onClick={() => setVerInactivos(!verInactivos)}>
            Ver inactivos {salud.inactivos}
          </Pastilla>
        </div>

        <p className="text-xs text-muted-foreground">
          {resultados.length === equipos.length
            ? `${resultados.length} equipos`
            : `${resultados.length} de ${equipos.length}`}
          {texto.trim() && resultados.length === 0 && " — si acá no sale, al comercial tampoco le sale."}
        </p>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        {resultados.map((e) => (
          <TarjetaEquipo key={e.id} equipo={e} onAbrir={() => setAbierto(aEditable(e))} />
        ))}
      </div>

      <Dialog open={abierto !== null} onOpenChange={(v) => !v && setAbierto(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {abierto?.id === null
                ? "Cargar un equipo al catálogo"
                : `${abierto?.marca} ${abierto?.modelo} — así sale impreso`}
            </DialogTitle>
          </DialogHeader>
          {abierto && <FichaTecnicaEditor equipo={abierto} onListo={() => setAbierto(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
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
    colores: e.colores,
    fotoPath: e.fotoPath,
    fichaTexto: e.fichaTexto,
    precios: e.precios,
    disponibles: e.disponibles,
  };
}

function Pastilla({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
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

function TarjetaEquipo({ equipo: e, onAbrir }: { equipo: EquipoCatalogo; onAbrir: () => void }) {
  const incompleto = e.precios.length === 0 || !e.tieneFicha || !e.fotoPath;
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onAbrir()}
      title="Abrir la ficha para verla o corregirla"
      className={cn(
        "flex cursor-pointer gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/40",
        !e.activo ? "border-dashed border-border bg-secondary/30" : incompleto ? "border-amber-300" : "border-border",
      )}
    >
      {/* La foto que va a salir impresa. Verla acá evita el caso de la foto
          equivocada, que solo se descubría con el PDF ya enviado. */}
      <div className="size-20 flex-none overflow-hidden rounded-md border border-border bg-white">
        {e.fotoPath ? (
          <Image
            src={`/productos/${e.fotoPath.split("/").pop()}`}
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
          {!e.activo && (
            <span className="rounded-full bg-foreground/10 px-1.5 text-[10px] font-bold uppercase text-muted-foreground">
              inactivo
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

          {/* El stock, acá y no en otra pantalla: es un dato del equipo. */}
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              (e.disponibles ?? 0) > 0 ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-secondary text-muted-foreground",
            )}
          >
            {e.disponibles === null
              ? "stock sin cargar"
              : e.disponibles > 0
                ? `${e.disponibles} en almacén`
                : "sin stock"}
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
