"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { reordenarFotosProtocolo } from "@/lib/acciones/protocolo-orden";
import { Button } from "@/components/ui/button";
import { rotuloFotoProtocolo } from "@/lib/protocolo-fotos";

/**
 * ORDENAR LAS FOTOS DEL PROTOCOLO (gerencia 20-10): «primero la placa, la
 * máquina general y después la foto específica». No se imprime.
 */
export function OrdenFotosProtocolo({ itemId, servicioId, fotos }: { itemId: string; servicioId: string; fotos: { path: string; url: string }[] }) {
  const router = useRouter();
  const [orden, setOrden] = useState(fotos);
  const [pendiente, empezar] = useTransition();
  const cambio = orden.some((f, i) => f.path !== fotos[i]?.path);
  const mover = (i: number, d: -1 | 1) =>
    setOrden((o) => {
      const j = i + d;
      if (j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  return (
    <div className="no-imprimir mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
      <p className="font-semibold">Orden de las fotos: 1 la placa, 2 el equipo completo, después los detalles.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {orden.map((f, i) => (
          <div key={f.path} className="w-28 rounded border border-amber-300 bg-white p-1 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt="" className="aspect-[4/3] w-full object-cover" />
            <p className="mt-0.5 text-[10px] font-semibold text-neutral-700">
              {i + 1} · {rotuloFotoProtocolo(i)}
            </p>
            <div className="mt-0.5 flex justify-between">
              <button type="button" aria-label="Mover antes" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-0.5 hover:bg-amber-100 disabled:opacity-30">
                <ArrowLeft className="size-3.5" />
              </button>
              <button type="button" aria-label="Mover después" disabled={i === orden.length - 1} onClick={() => mover(i, 1)} className="rounded p-0.5 hover:bg-amber-100 disabled:opacity-30">
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <Button
        size="sm"
        className="mt-2"
        disabled={!cambio || pendiente}
        porQue={!cambio ? "Mueva las fotos con las flechas para cambiar el orden." : undefined}
        onClick={() =>
          empezar(async () => {
            const r = await reordenarFotosProtocolo(itemId, servicioId, orden.map((f) => f.path));
            if (r.error) return void toast.error(r.error, { duration: 8000 });
            toast.success("Orden guardado: así sale en el protocolo.");
            router.refresh();
          })
        }
      >
        {pendiente && <Loader2 className="size-3.5 animate-spin" />} Guardar el orden
      </Button>
    </div>
  );
}
