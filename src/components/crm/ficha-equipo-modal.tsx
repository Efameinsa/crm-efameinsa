"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, FileText, Pencil, TriangleAlert } from "lucide-react";
import { guardarEquipo, fijarPrecio } from "@/lib/acciones/productos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { EquipoCatalogo } from "@/lib/catalogo-operaciones";
import { cn } from "@/lib/utils";

/**
 * La ficha del equipo: cómo está hoy, y cómo cambiarla.
 *
 * SE ABRE MIRANDO, NO EDITANDO. Casi siempre se entra a comprobar —«¿la
 * descripción quedó bien?»—, no a corregir; abrir en un formulario con veinte
 * campos abiertos convierte cada consulta en un riesgo de tocar algo sin
 * querer. Se lee, y si hay que corregir se pulsa «Editar».
 *
 * LA DESCRIPCIÓN SE EDITA COMO TEXTO. Es lo que sale impreso en la cotización y
 * son 42 renglones de promedio (hasta 104): un formulario con un campo por
 * renglón no lo usa nadie. Se edita como se lee, con cuatro marcas que son las
 * cuatro formas que existen —«# » título, «## » subtítulo, «- » viñeta, y
 * «Rótulo: valor» para un dato—. La ida y vuelta se probó contra las 124 fichas
 * reales: las 124 vuelven idénticas.
 *
 * Y AL LADO, EL PDF. Ver el texto no es ver la hoja impresa: los dos botones de
 * abajo abren la cotización de verdad, en Efameinsa o en Open.
 */
export function FichaEquipoModal({
  equipo,
  fichaTexto,
  editable,
}: {
  equipo: EquipoCatalogo;
  /** La descripción impresa, ya convertida a texto por el servidor. */
  fichaTexto: string;
  /** Si la ida y vuelta de esta ficha es exacta. Si no, se puede ver pero no editar. */
  editable: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  const [nombre, setNombre] = useState(equipo.nombre);
  const [marca, setMarca] = useState(equipo.marca);
  const [modelo, setModelo] = useState(equipo.modelo);
  const [sku, setSku] = useState(equipo.sku ?? "");
  const [categoria, setCategoria] = useState(equipo.categoria ?? "");
  const [capacidad, setCapacidad] = useState(equipo.capacidad ?? "");
  const [activo, setActivo] = useState(equipo.activo);
  const [texto, setTexto] = useState(fichaTexto);
  const [precios, setPrecios] = useState(() =>
    Object.fromEntries(equipo.precios.map((p) => [p.tier, String(p.precio)])) as Record<string, string>,
  );

  function cancelar() {
    setNombre(equipo.nombre);
    setMarca(equipo.marca);
    setModelo(equipo.modelo);
    setSku(equipo.sku ?? "");
    setCategoria(equipo.categoria ?? "");
    setCapacidad(equipo.capacidad ?? "");
    setActivo(equipo.activo);
    setTexto(fichaTexto);
    setPrecios(Object.fromEntries(equipo.precios.map((p) => [p.tier, String(p.precio)])));
    setEditando(false);
  }

  function guardar() {
    empezar(async () => {
      const r = await guardarEquipo(equipo.id, {
        nombre,
        marca,
        modelo,
        sku: sku || null,
        categoria: categoria || null,
        capacidad: capacidad || null,
        segmento: equipo.segmento,
        activo,
        fichaTexto: texto,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }

      // Los precios se guardan aparte porque se versionan: cada cambio vence el
      // vigente y abre uno nuevo, para que el histórico siga contando la verdad.
      const cambios: string[] = [];
      for (const p of equipo.precios) {
        const nuevo = Number(precios[p.tier]);
        if (!Number.isFinite(nuevo) || nuevo === p.precio) continue;
        const rp = await fijarPrecio(equipo.id, p.tier, nuevo);
        if (rp.error) {
          toast.error(`Precio ${p.tier}: ${rp.error}`);
          return;
        }
        if (!rp.sinCambio) cambios.push(`${p.tier} ${p.precio.toLocaleString("es-PE")} → ${nuevo.toLocaleString("es-PE")}`);
      }

      toast.success(cambios.length ? `Guardado · ${cambios.join(", ")}` : "Guardado");
      setEditando(false);
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) cancelar();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="text-[11px]">
            <Eye className="size-3" /> Ver ficha
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {equipo.marca} {equipo.modelo}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="size-32 flex-none overflow-hidden rounded-lg border border-border bg-white">
              {equipo.fotoPath ? (
                <Image
                  src={`/productos/${equipo.fotoPath.split("/").pop()}`}
                  alt={`${equipo.marca} ${equipo.modelo}`}
                  width={128}
                  height={128}
                  className="size-full object-contain"
                  unoptimized
                />
              ) : (
                <span className="flex size-full items-center justify-center text-xs text-muted-foreground">sin foto</span>
              )}
            </div>

            <div className="min-w-[260px] flex-1 space-y-2">
              {editando ? (
                <>
                  <Campo etiqueta="Nombre" valor={nombre} onChange={setNombre} />
                  <div className="grid grid-cols-2 gap-2">
                    <Campo etiqueta="Marca" valor={marca} onChange={setMarca} />
                    <Campo etiqueta="Modelo" valor={modelo} onChange={setModelo} />
                    <Campo etiqueta="Código (SKU)" valor={sku} onChange={setSku} />
                    <Campo etiqueta="Capacidad" valor={capacidad} onChange={setCapacidad} />
                    <Campo etiqueta="Categoría" valor={categoria} onChange={setCategoria} />
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
                    <span className="text-foreground">
                      En el catálogo{" "}
                      <span className="text-muted-foreground">— si se desmarca, el comercial deja de encontrarlo</span>
                    </span>
                  </label>
                </>
              ) : (
                <>
                  <p className="text-sm text-foreground">{equipo.nombre}</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <Dato etiqueta="Código">{equipo.sku ?? "—"}</Dato>
                    <Dato etiqueta="Capacidad">{equipo.capacidad ?? "—"}</Dato>
                    <Dato etiqueta="Categoría">{equipo.categoria ?? "—"}</Dato>
                    <Dato etiqueta="Segmento">{equipo.segmento.replace("_", "-")}</Dato>
                    {equipo.calentamiento && <Dato etiqueta="Calentamiento">{equipo.calentamiento}</Dato>}
                    {equipo.montaje && <Dato etiqueta="Montaje">{equipo.montaje}</Dato>}
                    {equipo.colores.length > 0 && <Dato etiqueta="Colores">{equipo.colores.join(" / ")}</Dato>}
                    {equipo.disponibles !== null && (
                      <Dato etiqueta="En almacén">{equipo.disponibles} disponibles</Dato>
                    )}
                  </dl>
                  {!equipo.activo && (
                    <p className="inline-flex rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      fuera del catálogo
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Precios. Se ven siempre; se tocan solo al editar. */}
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Precios vigentes</p>
            {equipo.precios.length === 0 ? (
              <p className="text-xs text-amber-700">Sin precio: el comercial lo encuentra y no lo puede cotizar.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {equipo.precios.map((p) => (
                  <span key={p.tier} className="text-sm">
                    <span className="mr-1 text-xs capitalize text-muted-foreground">{p.tier}</span>
                    {editando ? (
                      <input
                        value={precios[p.tier] ?? ""}
                        onChange={(e) => setPrecios({ ...precios, [p.tier]: e.target.value.replace(/[^\d.]/g, "") })}
                        inputMode="decimal"
                        className="w-28 rounded-md border border-border bg-background px-2 py-1 text-right font-mono text-sm outline-none focus:border-primary"
                      />
                    ) : (
                      <span className="font-semibold tabular-nums text-foreground">
                        {p.precio.toLocaleString("es-PE")}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
            {editando && equipo.precios.length > 0 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Cambiar un precio no pisa el anterior: lo vence y abre uno nuevo, para que el histórico siga contando a
                cuánto se vendió antes.
              </p>
            )}
          </div>

          {/* La descripción impresa. */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Lo que sale impreso en la cotización
              </p>
              {editando && (
                <p className="text-[11px] text-muted-foreground">
                  <code className="rounded bg-secondary px-1"># título</code>{" "}
                  <code className="rounded bg-secondary px-1">## subtítulo</code>{" "}
                  <code className="rounded bg-secondary px-1">- viñeta</code>{" "}
                  <code className="rounded bg-secondary px-1">Rótulo: valor</code>
                </p>
              )}
            </div>

            {editando ? (
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={16}
                className="w-full rounded-md border border-border bg-background p-2.5 font-mono text-xs leading-relaxed outline-none focus:border-primary"
              />
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-secondary/30 p-3">
                <FichaLeida texto={fichaTexto} />
              </div>
            )}

            {!editable && (
              <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] leading-snug text-amber-900">
                <TriangleAlert className="mt-0.5 size-3.5 flex-none" />
                Esta ficha tiene una forma que el editor de texto no reproduce exactamente, así que se puede mirar pero
                no editar desde acá. Es una de las poquísimas con secciones por máquina.
              </p>
            )}
          </div>

          {/* Cómo se ve impreso de verdad. */}
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <a
              href={`/api/productos/${equipo.id}/vista-previa`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <FileText className="size-3.5" /> Ver como Efameinsa
            </a>
            <a
              href={`/api/productos/${equipo.id}/vista-previa?serie=OPEN`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <FileText className="size-3.5" /> Ver como Open
            </a>
          </div>
        </div>

        <DialogFooter>
          {editando ? (
            <>
              <Button variant="ghost" onClick={cancelar} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar cambios"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditando(true)} disabled={!editable}>
              <Pencil className="size-3.5" /> Editar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ etiqueta, valor, onChange }: { etiqueta: string; valor: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</span>
      <Input value={valor} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

/** La ficha leída como se va a leer impresa, no como código fuente. */
function FichaLeida({ texto }: { texto: string }) {
  return (
    <div className="space-y-0.5 text-xs">
      {texto.split("\n").map((l, i) => {
        const linea = l.trim();
        if (!linea) return null;
        if (linea.startsWith("## ")) {
          return (
            <p key={i} className="pt-1 font-semibold text-foreground">
              {linea.slice(3)}
            </p>
          );
        }
        if (linea.startsWith("# ")) {
          return (
            <p key={i} className="pt-2 text-[11px] font-bold uppercase tracking-wide text-primary">
              {linea.slice(2)}
            </p>
          );
        }
        if (linea.startsWith("- ")) {
          return (
            <p key={i} className="flex gap-1.5 text-muted-foreground">
              <span className="text-foreground">·</span>
              {linea.slice(2)}
            </p>
          );
        }
        const corte = linea.indexOf(":");
        return (
          <p key={i} className={cn("text-muted-foreground", corte > 0 && "font-medium")}>
            {corte > 0 ? (
              <>
                <span className="text-foreground">{linea.slice(0, corte)}:</span>
                {linea.slice(corte + 1)}
              </>
            ) : (
              linea
            )}
          </p>
        );
      })}
    </div>
  );
}
