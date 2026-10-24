"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GripVertical, Loader2 } from "lucide-react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragOverEvent } from "@dnd-kit/core";
import { reordenarFotosProtocolo } from "@/lib/acciones/protocolo-orden";
import { rotuloFotoProtocolo } from "@/lib/protocolo-fotos";
import { cn } from "@/lib/utils";

type Foto = { path: string; url: string };

/**
 * ORDENAR LAS FOTOS DEL PROTOCOLO (gerencia 20-10): «primero la placa, la
 * máquina general y después la foto específica». No se imprime.
 * Se arrastran con el mouse o el dedo (Lesly, 24-10: «tipo drag and drop, no
 * con flechitas») y el orden se guarda solo al soltar.
 */
export function OrdenFotosProtocolo({ itemId, servicioId, fotos }: { itemId: string; servicioId: string; fotos: Foto[] }) {
  const router = useRouter();
  const [orden, setOrden] = useState(fotos);
  const [antes, setAntes] = useState(fotos);
  const [activa, setActiva] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  // En la tablet, un toque corto sigue sirviendo para desplazar la página: se arrastra manteniendo el dedo.
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  // Mientras se arrastra, las demás se corren para hacerle lugar.
  function alPasar({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return;
    setOrden((o) => {
      const de = o.findIndex((f) => f.path === active.id);
      const a = o.findIndex((f) => f.path === over.id);
      if (de < 0 || a < 0) return o;
      const n = [...o];
      const [movida] = n.splice(de, 1);
      n.splice(a, 0, movida);
      return n;
    });
  }

  function alSoltar() {
    setActiva(null);
    if (orden.every((f, i) => f.path === antes[i]?.path)) return;
    const nuevo = orden;
    empezar(async () => {
      const r = await reordenarFotosProtocolo(itemId, servicioId, nuevo.map((f) => f.path));
      if (r.error) {
        setOrden(antes);
        return void toast.error(r.error, { duration: 8000 });
      }
      setAntes(nuevo);
      toast.success("Orden guardado: así sale en el protocolo.");
      router.refresh();
    });
  }

  const fotoActiva = orden.find((f) => f.path === activa);
  return (
    <div className="no-imprimir mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
      <p className="font-semibold">
        Orden de las fotos: 1 la placa, 2 el equipo completo, después los detalles.{" "}
        <span className="font-normal">Arrastre cada foto a su lugar (en la tablet, mantenga el dedo y arrastre); se guarda sola al soltarla.</span>
        {pendiente && <Loader2 className="ml-1.5 inline size-3.5 animate-spin" />}
      </p>
      <DndContext sensors={sensores} onDragStart={({ active }) => setActiva(String(active.id))} onDragOver={alPasar} onDragEnd={alSoltar} onDragCancel={() => { setActiva(null); setOrden(antes); }}>
        <div className="mt-2 flex flex-wrap gap-2">
          {orden.map((f, i) => (
            <FotoArrastrable key={f.path} foto={f} n={i} arrastrando={activa === f.path} />
          ))}
        </div>
        <DragOverlay>{fotoActiva && <Tarjeta foto={fotoActiva} n={orden.indexOf(fotoActiva)} levantada />}</DragOverlay>
      </DndContext>
    </div>
  );
}

function FotoArrastrable({ foto, n, arrastrando }: { foto: Foto; n: number; arrastrando: boolean }) {
  const { attributes, listeners, setNodeRef: arrastre } = useDraggable({ id: foto.path });
  const { setNodeRef: destino, isOver } = useDroppable({ id: foto.path });
  return (
    <div
      ref={(el) => {
        arrastre(el);
        destino(el);
      }}
      {...attributes}
      {...listeners}
      className={cn("touch-none select-none", arrastrando && "opacity-30", isOver && !arrastrando && "ring-2 ring-[#8B1510] rounded")}
    >
      <Tarjeta foto={foto} n={n} />
    </div>
  );
}

function Tarjeta({ foto, n, levantada = false }: { foto: Foto; n: number; levantada?: boolean }) {
  return (
    <div className={cn("w-28 cursor-grab rounded border border-amber-300 bg-white p-1 text-center", levantada && "cursor-grabbing shadow-lg ring-2 ring-[#8B1510]")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={foto.url} alt="" draggable={false} className="pointer-events-none aspect-[4/3] w-full object-cover" />
      <p className="mt-0.5 flex items-center justify-center gap-0.5 text-[10px] font-semibold text-neutral-700">
        <GripVertical className="size-3 text-neutral-400" />
        {n + 1} · {rotuloFotoProtocolo(n)}
      </p>
    </div>
  );
}
