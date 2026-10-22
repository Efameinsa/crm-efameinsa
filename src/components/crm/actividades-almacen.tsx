"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { agregarActividadDia, borrarActividadDia } from "@/lib/acciones/bitacora";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { armarActividad, TIPOS_ACTIVIDAD as TIPOS, type TipoActividad as Tipo } from "@/lib/actividad-almacen";

/**
 * «REGISTRAR ACTIVIDAD» DEL ALMACÉN (Santos, 22-10): «Diana está embalando y
 * despachando en la planta algunos productos y eso no figura en el CRM; debe
 * tener una opción para agregar actividades adicionales».
 *
 * Lo que no pasa por un pedido del CRM (un coche que se embala y sale, un
 * repuesto que se entrega en ventanilla, un inventario) se anota aquí en
 * segundos: el tipo en un toque, qué, cuántos y para quién. Queda en la
 * bitácora del día (`bitacora_dia`), con la hora en que se anotó, y entra a
 * «Lo que hizo el almacén hoy» y al reporte del día como trabajo del almacén.
 * Se guarda como una frase armada («Embalaje · 3 × coche HM-401 · para
 * Hotel X»), que es como la lee gerencia en el reporte.
 */

export interface ActividadAnotada {
  id: string;
  orden: number;
  texto: string;
  hora?: string | null;
}

export function ActividadesAlmacen({ fecha, actividades }: { fecha: string; actividades: ActividadAnotada[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("Embalaje");
  const [que, setQue] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [para, setPara] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, iniciar] = useTransition();

  const texto = armarActividad({ tipo, que, cantidad, para, nota });
  const pide = TIPOS.find((t) => t.clave === tipo)!.pide;
  const listo = tipo === "Otra" || tipo === "Orden y limpieza" ? !!(que.trim() || nota.trim()) : !!que.trim();

  function guardar() {
    if (!listo) return;
    iniciar(async () => {
      const r = await agregarActividadDia({ fecha, texto });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Actividad registrada");
      setQue("");
      setCantidad("");
      setPara("");
      setNota("");
      router.refresh();
    });
  }

  function borrar(id: string) {
    iniciar(async () => {
      const r = await borrarActividadDia(id);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {!abierto ? (
        <Button type="button" className="w-full" onClick={() => setAbierto(true)}>
          <Plus className="size-4" /> Registrar actividad
        </Button>
      ) : (
        <div className="space-y-2.5 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">¿Qué hizo?</p>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de actividad">
            {TIPOS.map((t) => (
              <button
                key={t.clave}
                type="button"
                role="radio"
                aria-checked={tipo === t.clave}
                onClick={() => setTipo(t.clave)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  tipo === t.clave ? "border-[#8B1510] bg-[#8B1510] text-white" : "border-border hover:bg-muted",
                )}
              >
                {t.clave}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <label className="text-[11px] text-muted-foreground">
              {pide}
              <Input value={que} onChange={(e) => setQue(e.target.value)} placeholder="coche HM-401, repuesto, rodillo…" className="mt-0.5" autoFocus />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Cuántos
              <Input value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="1" className="mt-0.5" />
            </label>
          </div>
          <label className="block text-[11px] text-muted-foreground">
            {tipo === "Recepción" ? "De quién / proveedor (opcional)" : "Para quién / destino (opcional)"}
            <Input value={para} onChange={(e) => setPara(e.target.value)} placeholder={tipo === "Recepción" ? "Importaciones" : "cliente, agencia, sede…"} className="mt-0.5" />
          </label>
          <label className="block text-[11px] text-muted-foreground">
            Nota (opcional)
            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  guardar();
                }
              }}
              placeholder="guía, transportista, observación…"
              className="mt-0.5"
            />
          </label>
          {texto && <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs">Quedará así: «{texto}»</p>}
          <Button type="button" className="w-full" onClick={guardar} disabled={guardando || !listo}>
            {guardando ? "Guardando…" : "Registrar"}
          </Button>
        </div>
      )}

      {actividades.length > 0 && (
        <ol className="space-y-1.5">
          {actividades.map((a) => (
            <li key={a.id} className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
              <span className="mt-0.5 w-10 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{a.hora ?? "—"}</span>
              <span className="flex-1 text-sm text-foreground">{a.texto}</span>
              <button
                type="button"
                onClick={() => borrar(a.id)}
                disabled={guardando}
                aria-label={`Quitar "${a.texto}"`}
                className="cursor-pointer text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
