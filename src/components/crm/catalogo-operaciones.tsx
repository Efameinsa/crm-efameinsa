"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Eye, FileText, Search, TriangleAlert } from "lucide-react";
import { buscarEquipos } from "@/lib/buscar-equipo";
import type { EquipoCatalogo, SaludCatalogo } from "@/lib/catalogo-operaciones";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * El catálogo, buscado como lo busca el comercial.
 *
 * ES EL MISMO BUSCADOR, no uno parecido: `buscarEquipos()` es la función que
 * usa el cotizador. Si acá no aparece, al comercial tampoco le va a aparecer —
 * y esa es justamente la comprobación que hasta hoy no se podía hacer sin
 * pedirle a alguien que cotizara de verdad.
 *
 * Cada equipo trae los dos botones que contestan lo que sigue: la ficha
 * completa como la ve el cotizador, y el PDF de la cotización tal como le
 * llegaría al cliente.
 */
export function CatalogoOperaciones({
  equipos,
  salud,
}: {
  equipos: EquipoCatalogo[];
  salud: SaludCatalogo;
}) {
  const [texto, setTexto] = useState("");
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [verInactivos, setVerInactivos] = useState(false);
  const [categoria, setCategoria] = useState<string | null>(null);

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
    return buscarEquipos(lista, texto);
  }, [equipos, texto, soloProblemas, verInactivos, categoria]);

  return (
    <div className="space-y-4">
      {/* LO QUE ESTÁ MAL, ARRIBA. Un catálogo se mantiene por sus huecos, y un
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
            <p className="text-xs text-amber-900">{salud.sinFicha} sin ficha técnica: salen en la cotización sin especificaciones.</p>
          )}
          {salud.sinFoto > 0 && <p className="text-xs text-amber-900">{salud.sinFoto} sin foto.</p>}
        </div>
      )}

      {/* El buscador, con el mismo comportamiento que el del cotizador. */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Busque como buscaría un comercial: «secadora eléctrica primus», «rx135», «coche azul»…"
            className="pl-8"
          />
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
          <FilaEquipo key={e.id} equipo={e} />
        ))}
      </div>
    </div>
  );
}

function Pastilla({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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

function FilaEquipo({ equipo: e }: { equipo: EquipoCatalogo }) {
  const incompleto = e.precios.length === 0 || !e.tieneFicha || !e.fotoPath;
  return (
    <article
      className={cn(
        "flex gap-3 rounded-lg border p-3",
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
          {e.colores.length > 0 && <span>{e.colores.length} colores</span>}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {e.precios.length === 0 ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700">
              <AlertTriangle className="size-3" /> sin precio
            </span>
          ) : (
            e.precios.map((p) => (
              <span key={p.tier} className="text-[11px] tabular-nums text-foreground">
                <span className="capitalize text-muted-foreground">{p.tier}</span>{" "}
                {p.precio.toLocaleString("es-PE")}
              </span>
            ))
          )}
          {!e.tieneFicha && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700">
              <AlertTriangle className="size-3" /> sin ficha
            </span>
          )}
          {e.tieneFicha && <span className="text-[11px] text-muted-foreground">{e.caracteristicas} líneas de ficha</span>}
        </div>

        {/* Las dos preguntas que siguen a «lo encontré»: cómo se lee y cómo se
            imprime. La vista previa arma la cotización de verdad. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <a
            href={`/api/productos/${e.id}/vista-previa`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent"
          >
            <Eye className="size-3" /> Vista previa de la cotización
          </a>
          <a
            href={`/api/productos/${e.id}/vista-previa?serie=OPEN`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent"
          >
            <FileText className="size-3" /> en Open
          </a>
        </div>
      </div>
    </article>
  );
}
