"use client";

// EL DETALLE DEL SERVICIO (0574). Santos, 21-10: «en servicio no se pide
// código, es solo escrito… el sistema debe pedir redactar o jalar la
// cotización… esas líneas deberían estar dentro del recuadro… el nombre de los
// servicios, cantidad, pero sin monto necesariamente, y en cada parte ella debe
// poder editar de manera amigable». El cuadro de la cotización, editable en el
// sitio: se escribe en la celda y se guarda todo de una vez.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import { guardarDetalleDelServicio, traerLineasDelCierre, type FilaDelServicio } from "@/lib/acciones/pedido-central";
import type { EquipoDelPedido } from "@/lib/acciones/postventa";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Fila = { clave: string; id: string | null; descripcion: string; cantidad: string; serie: string; precio: string };

const desdeEquipos = (equipos: EquipoDelPedido[]): Fila[] =>
  equipos
    .filter((e) => !e.parte_de)
    .map((e) => ({
      clave: e.id,
      id: e.id,
      descripcion: e.descripcion,
      cantidad: String(e.cantidad ?? 1),
      serie: e.serie ?? "",
      precio: e.precio == null ? "" : String(e.precio),
    }));

/** Lo que se compara para saber si hay cambios (sin la clave de React). */
const huella = (fs: Fila[]) => JSON.stringify(fs.map((f) => [f.id, f.descripcion, f.cantidad, f.serie, f.precio]));

let siguiente = 0;
const nueva = (): Fila => ({ clave: `nueva-${++siguiente}`, id: null, descripcion: "", cantidad: "1", serie: "", precio: "" });

export function DetalleDelServicio({ servicioId, equipos, despachado }: { servicioId: string; equipos: EquipoDelPedido[]; despachado: boolean }) {
  const router = useRouter();
  const [filas, setFilas] = useState<Fila[]>(() => desdeEquipos(equipos));
  const [problema, setProblema] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const original = huella(desdeEquipos(equipos));
  const cambiado = huella(filas) !== original;

  // Lo que llega del servidor (al traer o guardar) reemplaza la tabla.
  const [visto, setVisto] = useState(original);
  if (visto !== original) {
    setVisto(original);
    setFilas(desdeEquipos(equipos));
  }

  // Con cambios sin guardar, el navegador pregunta antes de cerrar o recargar.
  useEffect(() => {
    if (!cambiado) return;
    const avisar = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [cambiado]);

  const cambiar = (clave: string, campo: keyof Fila, valor: string) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, [campo]: valor } : f)));
  const faltaTexto = filas.some((f) => !f.descripcion.trim());
  const cantidadMala = filas.some((f) => !(Number(f.cantidad.replace(",", ".")) > 0));

  const guardar = () => {
    setProblema(null);
    const datos: FilaDelServicio[] = filas.map((f) => ({
      id: f.id,
      descripcion: f.descripcion,
      cantidad: Number(f.cantidad.replace(",", ".")),
      serie: f.serie,
      precio: f.precio.trim() ? Number(f.precio.replace(",", ".")) : null,
    }));
    startTransition(async () => {
      const r = await guardarDetalleDelServicio(servicioId, datos);
      if (r.error) return setProblema(r.error);
      toast.success("Detalle del servicio guardado");
      router.refresh();
    });
  };
  const traer = () => {
    setProblema(null);
    startTransition(async () => {
      const r = await traerLineasDelCierre(servicioId);
      if (r.error) return setProblema(r.error);
      toast.success(r.traidas ? `Se trajeron ${r.traidas} línea${r.traidas === 1 ? "" : "s"}` : "Todas las líneas ya están en la tabla");
      router.refresh();
    });
  };

  const celda = "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs hover:border-border focus:border-primary focus:bg-background focus:outline-none disabled:hover:border-transparent";

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <ClipboardList className="size-4" /> Detalle del servicio
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {filas.length === 1 ? "1 línea" : `${filas.length} líneas`}
        </span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {despachado
          ? "El pedido ya salió: el detalle queda como está."
          : "Es un servicio: no pide código al almacén. Escriba sobre cada casilla para corregirla; la serie es la de la máquina que se atiende, y el precio es opcional."}
      </p>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-xs">
          <thead>
            <tr className="bg-secondary text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="w-8 px-1.5 py-1">N.º</th>
              <th className="px-1.5 py-1">Descripción</th>
              <th className="w-16 px-1.5 py-1 text-right">Cant.</th>
              <th className="w-36 px-1.5 py-1">Serie del equipo</th>
              <th className="w-24 px-1.5 py-1 text-right">Precio (opc.)</th>
              {!despachado && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, k) => (
              <tr key={f.clave} className="border-b border-border align-top">
                <td className="px-1.5 py-1.5 font-semibold text-muted-foreground">{k + 1}</td>
                <td className="py-0.5">
                  <textarea
                    value={f.descripcion}
                    onChange={(ev) => cambiar(f.clave, "descripcion", ev.target.value)}
                    disabled={despachado || pendiente}
                    rows={Math.min(4, Math.max(1, Math.ceil(f.descripcion.length / 70)))}
                    placeholder="Qué servicio se hace (ej. Mantenimiento preventivo lavadora UCT060)"
                    className={cn(celda, "resize-y", !f.descripcion.trim() && "border-destructive/50")}
                  />
                </td>
                <td className="py-0.5">
                  <input
                    value={f.cantidad}
                    onChange={(ev) => cambiar(f.clave, "cantidad", ev.target.value)}
                    disabled={despachado || pendiente}
                    inputMode="decimal"
                    className={cn(celda, "text-right tabular-nums")}
                  />
                </td>
                <td className="py-0.5">
                  <input
                    value={f.serie}
                    onChange={(ev) => cambiar(f.clave, "serie", ev.target.value)}
                    disabled={despachado || pendiente}
                    placeholder="—"
                    className={cn(celda, "font-mono uppercase")}
                  />
                </td>
                <td className="py-0.5">
                  <input
                    value={f.precio}
                    onChange={(ev) => cambiar(f.clave, "precio", ev.target.value)}
                    disabled={despachado || pendiente}
                    inputMode="decimal"
                    placeholder="—"
                    className={cn(celda, "text-right tabular-nums")}
                  />
                </td>
                {!despachado && (
                  <td className="py-1 text-center">
                    <button
                      type="button"
                      title="Quitar esta línea"
                      disabled={pendiente}
                      onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-1.5 py-3 text-center text-muted-foreground">
                  Todavía no hay líneas. Tráigalas del cierre o la cotización, o agregue una y escríbala.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!despachado && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pendiente} onClick={() => setFilas((fs) => [...fs, nueva()])}>
            <Plus className="size-3.5" /> Agregar línea
          </Button>
          {filas.length === 0 && !cambiado && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pendiente} onClick={traer}>
              Traer del cierre o la cotización
            </Button>
          )}
          {cambiado && (
            <>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={pendiente || faltaTexto || cantidadMala}
                porQue={pendiente ? null : faltaTexto ? "Hay una línea sin descripción: escríbala o quítela." : cantidadMala ? "Revise las cantidades: tienen que ser mayores que cero." : null}
                onClick={guardar}
              >
                {pendiente && <Loader2 className="size-3 animate-spin" />} Guardar cambios
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={pendiente} onClick={() => setFilas(desdeEquipos(equipos))}>
                Deshacer
              </Button>
              <span className="text-[11px] font-medium text-amber-700">Hay cambios sin guardar</span>
            </>
          )}
        </div>
      )}
      {problema && <p role="alert" className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs leading-snug text-destructive">{problema}</p>}
    </div>
  );
}
