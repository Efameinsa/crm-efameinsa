"use client";

import { useMemo, useState } from "react";
import { Boxes, Search, Ship } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * EL INVENTARIO QUE VE EL COMERCIAL (Carlos, 22-10-2026): «la idea es que este
 * inventario se vea por los comerciales… pero ahí le vamos a ocultar algunas
 * columnas». Sin costo, sin fecha de ingreso, sin dueño de la reserva: solo
 * qué máquinas hay, con su serie, dónde están y si ya están tomadas. Y lo que
 * viene de Importaciones, con fecha, para «vender lo que no hay».
 *
 * «Que no permita ni captura de pantalla»: un navegador no puede impedir una
 * captura. Lo que sí se hace: la lista no se copia ni se selecciona, no se
 * imprime, y lleva el nombre de quien la mira como marca de agua, para que
 * una foto diga de dónde salió.
 */

export interface FilaInventarioComercial {
  id: string;
  codigo: string | null;
  marca: string | null;
  modelo: string;
  descripcion: string;
  serie: string;
  ubicacion: string | null;
  empresa: string | null;
  estado: "disponible" | "reservado";
}

export interface LlegadaComercial {
  id: string;
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  fechaEstimada: string | null;
}

const fecha = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "sin fecha");

export function InventarioComercial({ filas, llegadas, nombre }: { filas: FilaInventarioComercial[]; llegadas: LlegadaComercial[]; nombre: string }) {
  const [texto, setTexto] = useState("");
  const [marca, setMarca] = useState("");
  const [soloDisponibles, setSoloDisponibles] = useState(true);
  const marcas = useMemo(() => [...new Set(filas.map((f) => (f.marca ?? "").toUpperCase()).filter(Boolean))].sort(), [filas]);
  const lista = useMemo(() => {
    const tokens = texto.toUpperCase().split(/\s+/).filter(Boolean);
    return filas
      .filter((f) => !soloDisponibles || f.estado === "disponible")
      .filter((f) => !marca || (f.marca ?? "").toUpperCase() === marca)
      .filter((f) => tokens.every((t) => `${f.codigo ?? ""} ${f.marca ?? ""} ${f.modelo} ${f.descripcion} ${f.serie} ${f.empresa ?? ""}`.toUpperCase().includes(t)));
  }, [filas, texto, marca, soloDisponibles]);
  const disponibles = filas.filter((f) => f.estado === "disponible").length;
  const marcaDeAgua = `${nombre} · ${new Date().toLocaleDateString("es-PE")}`;

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

      <div className="inventario-protegido relative select-none rounded-xl border border-border p-3" onCopy={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}>
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Boxes className="size-4" /> Máquinas en el almacén, por serie
          <span className="text-xs font-normal text-muted-foreground">· {disponibles} disponibles</span>
        </p>
        <p className="mt-0.5 mb-2 max-w-prose text-xs text-muted-foreground">
          Lo que el almacén tiene registrado hoy. Una máquina «reservada» ya está tomada por un pedido. La lista es de uso interno: no se copia ni se imprime.
        </p>
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">El almacén todavía no cargó máquinas por serie. Mientras tanto, guíese por el stock del catálogo y confírmelo con Lesly.</p>
        ) : (
          <>
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
              <button type="button" onClick={() => setSoloDisponibles(!soloDisponibles)} className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", soloDisponibles ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                Solo disponibles
              </button>
              <span className="text-xs text-muted-foreground">{lista.length}</span>
            </div>
            <div className="relative overflow-x-auto rounded-lg border border-border">
              {/* Marca de agua: el nombre de quien mira, repetido en diagonal. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden opacity-[0.07]">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className="absolute -rotate-12 whitespace-nowrap text-sm font-semibold" style={{ top: `${i * 9}%`, left: `${(i % 3) * 30}%` }}>
                    {marcaDeAgua} · {marcaDeAgua} · {marcaDeAgua}
                  </span>
                ))}
              </div>
              <table className="w-full text-xs">
                <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-right">N.º</th>
                    <th className="px-2 py-1.5 text-left">Código</th>
                    <th className="px-2 py-1.5 text-left">Equipo</th>
                    <th className="px-2 py-1.5 text-left">Serie</th>
                    <th className="px-2 py-1.5 text-left">Ubicación</th>
                    <th className="px-2 py-1.5 text-left">Empresa</th>
                    <th className="px-2 py-1.5 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((f, i) => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1 font-mono font-semibold">{f.codigo ?? "—"}</td>
                      <td className="max-w-[300px] px-2 py-1">
                        <span className="font-medium">{[f.marca, f.modelo].filter(Boolean).join(" ")}</span>
                        <span className="block truncate text-[11px] text-muted-foreground" title={f.descripcion}>{f.descripcion}</span>
                      </td>
                      <td className="px-2 py-1 font-mono">{f.serie}</td>
                      <td className="px-2 py-1">{(f.ubicacion ?? "PLANTA").toUpperCase()}</td>
                      <td className="px-2 py-1">{f.empresa ?? "—"}</td>
                      <td className="px-2 py-1">
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", f.estado === "disponible" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900")}>
                          {f.estado === "disponible" ? "Disponible" : "Reservada"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
