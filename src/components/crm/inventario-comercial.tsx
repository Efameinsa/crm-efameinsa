"use client";

import { useMemo, useState } from "react";
import { Boxes, ChevronDown, ChevronRight, Search, Ship } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TablaPorCodigo, TablaPorSerie, agruparPorCodigo, type MaquinaTabla } from "@/components/crm/almacen-tabla";

/**
 * EL INVENTARIO QUE VE EL COMERCIAL (Carlos, 22-10-2026): «la idea es que este
 * inventario se vea por los comerciales… pero ahí le vamos a ocultar algunas
 * columnas». Sin costo, sin fecha de ingreso, sin para quién está reservada:
 * solo qué máquinas hay, con su serie, dónde están y si ya están tomadas. Y lo
 * que viene de Importaciones, con fecha, para «vender lo que no hay».
 *
 * Va plegado, con el resumen a la vista, para que el catálogo (la pantalla de
 * todos los días) no quede debajo de doscientas filas.
 *
 * «Que no permita ni captura de pantalla»: un navegador no puede impedir una
 * captura. Lo que sí se hace: la lista no se copia ni se selecciona, no se
 * imprime, y lleva el nombre de quien la mira como marca de agua, para que
 * una foto diga de dónde salió.
 */

export interface LlegadaComercial {
  id: string;
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  fechaEstimada: string | null;
}

const fecha = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "sin fecha");

export function InventarioComercial({ filas, llegadas, nombre }: { filas: MaquinaTabla[]; llegadas: LlegadaComercial[]; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [marca, setMarca] = useState("");
  const [modo, setModo] = useState<"codigo" | "serie">("codigo");
  const marcas = useMemo(() => [...new Set(filas.map((f) => (f.marca ?? "").toUpperCase()).filter(Boolean))].sort(), [filas]);
  const lista = useMemo(() => {
    const tokens = texto.toUpperCase().split(/\s+/).filter(Boolean);
    return filas
      .filter((f) => !marca || (f.marca ?? "").toUpperCase() === marca)
      .filter((f) => tokens.every((t) => `${f.codigo ?? ""} ${f.marca ?? ""} ${f.modelo} ${f.descripcion} ${f.serie} ${f.empresa ?? ""}`.toUpperCase().includes(t)));
  }, [filas, texto, marca]);
  const disponibles = filas.filter((f) => f.estado === "disponible").length;
  const reservadas = filas.filter((f) => f.estado === "reservado").length;
  const codigos = useMemo(() => agruparPorCodigo(filas).length, [filas]);
  const marcaDeAgua = `${nombre} · ${new Date().toLocaleDateString("es-PE")}`;
  const opciones = { puedeEditar: false, verIngreso: false, verCliente: false };

  return (
    <div className="space-y-3">
      <style>{`@media print { .inventario-protegido { display: none !important; } }`}</style>
      {llegadas.length > 0 && (
        <div className="rounded-lg border border-dashed border-sky-300 bg-sky-50/50 p-3 text-xs dark:border-sky-800 dark:bg-sky-950/20">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Ship className="size-4 text-sky-700" /> En camino (no cuenta como stock, pero se puede vender)
          </p>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">
            {llegadas.map((l) => (
              <li key={l.id} className="flex justify-between gap-2">
                <span>
                  {l.codigo && <span className="mr-1 font-mono font-semibold">{l.codigo}</span>}
                  {l.descripcion}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{l.cantidad} · llega {fecha(l.fechaEstimada)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="inventario-protegido select-none rounded-xl border border-border" onCopy={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}>
        <button type="button" onClick={() => setAbierto(!abierto)} className="flex w-full flex-wrap items-center gap-2 p-3 text-left hover:bg-accent/40">
          {abierto ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
          <Boxes className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Máquinas en el almacén, por serie</span>
          <span className="text-xs text-muted-foreground">
            {filas.length === 0
              ? "todavía sin cargar"
              : `${disponibles} disponibles en ${codigos} códigos${reservadas > 0 ? ` · ${reservadas} reservadas` : ""}`}
          </span>
          <span className="ml-auto text-xs text-primary">{abierto ? "Cerrar" : "Ver"}</span>
        </button>
        {abierto && (
          <div className="border-t border-border p-3">
            {filas.length === 0 ? (
              <p className="text-sm text-muted-foreground">El almacén todavía no cargó máquinas por serie. Mientras tanto, guíese por el stock del catálogo y confírmelo con Lesly.</p>
            ) : (
              <>
                <p className="mb-2 max-w-prose text-xs text-muted-foreground">
                  Lo que el almacén tiene registrado hoy. Una máquina «reservada» ya está tomada por un pedido. Lista de uso interno: no se copia ni se imprime.
                </p>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, modelo o serie…" className="pl-8" />
                  </div>
                  <select value={marca} onChange={(e) => setMarca(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                    <option value="">Todas las marcas</option>
                    {marcas.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <button type="button" onClick={() => setModo("codigo")} className={cn("rounded-full px-2 py-0.5 font-medium", modo === "codigo" ? "bg-foreground text-background" : "hover:text-foreground")}>Por código</button>
                    <button type="button" onClick={() => setModo("serie")} className={cn("rounded-full px-2 py-0.5 font-medium", modo === "serie" ? "bg-foreground text-background" : "hover:text-foreground")}>Por serie</button>
                  </span>
                </div>
                <div className="relative">
                  {/* Marca de agua: el nombre de quien mira, repetido en diagonal. */}
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden opacity-[0.08]">
                    {Array.from({ length: 14 }).map((_, i) => (
                      <span key={i} className="absolute -rotate-12 whitespace-nowrap text-sm font-semibold" style={{ top: `${i * 8}%`, left: `${(i % 3) * 30}%` }}>
                        {marcaDeAgua} · {marcaDeAgua} · {marcaDeAgua}
                      </span>
                    ))}
                  </div>
                  {lista.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ninguna máquina coincide.</p>
                  ) : modo === "codigo" ? (
                    <TablaPorCodigo filas={lista} opciones={opciones} />
                  ) : (
                    <TablaPorSerie filas={lista} opciones={opciones} />
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
