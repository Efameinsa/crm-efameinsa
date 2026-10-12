"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus, Trash2 } from "lucide-react";
import { crearPendienteAnotado, actualizarTarea, eliminarTarea } from "@/lib/acciones/tareas";
import { SelectorHora } from "@/components/crm/selector-hora";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Button } from "@/components/ui/button";
import {
  TIPOS_PENDIENTE,
  ETIQUETA_TIPO_PENDIENTE,
  type PendienteAnotado,
  type TipoPendiente,
} from "@/lib/pendientes-anotados";
import { cn } from "@/lib/utils";

/**
 * «Mis pendientes» de la bandeja (buzón, Rubí PV1, 12-10-2026: «que me dé la
 * opción de agregar más pendientes como Importación, Llamada programada,
 * Pendiente de stock»). Lo que el circuito no ve solo se anota acá con su tipo;
 * sale en el calendario y en «5b» del reporte diario hasta marcarlo resuelto.
 */
export function MisPendientesAnotados({ hoy, lista }: { hoy: string; lista: PendienteAnotado[] }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoPendiente>("importacion");
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [hora, setHora] = useState<string | null>(null);
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  function guardar() {
    empezar(async () => {
      const r = await crearPendienteAnotado({ tipo, titulo, fecha, hora });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Pendiente anotado: sale en su reporte diario hasta que lo marque resuelto");
      setTitulo("");
      setHora(null);
      setAbierto(false);
      router.refresh();
    });
  }

  function resolver(id: string) {
    empezar(async () => {
      const r = await actualizarTarea({ id, completada: true });
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  function quitar(id: string) {
    if (!confirm("¿Quitar este pendiente? Úselo si lo anotó por error; si ya se resolvió, márquelo como resuelto.")) return;
    empezar(async () => {
      const r = await eliminarTarea(id);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <SeccionPanel
      titulo={`Mis pendientes${lista.length > 0 ? ` (${lista.length})` : ""}`}
      accion={
        <Button size="sm" variant="outline" onClick={() => setAbierto((v) => !v)}>
          <Plus className="size-3.5" /> Agregar pendiente
        </Button>
      }
    >
      {abierto && (
        <div className="mb-3 space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_PENDIENTE.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  tipo === t ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
                )}
              >
                {ETIQUETA_TIPO_PENDIENTE[t]}
              </button>
            ))}
          </div>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Cliente y qué falta (ej.: Hotel X — variador F8496601 llega en importación)"
            maxLength={200}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground">Para el</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <SelectorHora valor={hora} onCambiar={setHora} etiquetaVacia="Sin hora" />
            <Button size="sm" onClick={guardar} disabled={enviando || !titulo.trim()} className="ml-auto">
              {enviando ? "Guardando…" : "Anotar"}
            </Button>
          </div>
        </div>
      )}

      {lista.length === 0 ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          No tiene pendientes anotados. Anote aquí lo que el sistema no ve solo —un repuesto en importación, una
          llamada programada, un pedido que espera stock—: sale en su reporte diario, por tipo, hasta que lo marque
          resuelto.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2.5">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
                {ETIQUETA_TIPO_PENDIENTE[p.tipo]}
              </span>
              <span className="min-w-[180px] flex-1 text-sm text-foreground">{p.titulo}</span>
              <span className={cn("text-xs tabular-nums", p.fecha < hoy ? "font-semibold text-destructive" : "text-muted-foreground")}>
                {p.fecha.split("-").reverse().join("/")}
                {p.hora ? ` ${p.hora}` : ""}
              </span>
              <Button size="sm" variant="outline" disabled={enviando} onClick={() => resolver(p.id)}>
                <Check className="size-3.5" /> Resuelto
              </Button>
              <button
                type="button"
                disabled={enviando}
                onClick={() => quitar(p.id)}
                title="Quitar (anotado por error)"
                className="cursor-pointer rounded p-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SeccionPanel>
  );
}
