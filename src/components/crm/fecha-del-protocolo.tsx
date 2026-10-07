"use client";

// LA FECHA REAL DEL PROTOCOLO, CORREGIDA DESDE EL INFORME (0416; Ariana,
// almacén, 07-10: «en el informe debería existir una opción para editar la
// fecha de realización del protocolo»). Solo en pantalla: no sale al imprimir.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { fechaDelProtocolo } from "@/lib/acciones/almacen";

export function FechaDelProtocolo({ itemId, servicioId, fecha }: { itemId: string; servicioId: string; fecha: string | null }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(fecha ?? "");
  const [pendiente, startTransition] = useTransition();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  if (!editando)
    return (
      <button type="button" className="no-imprimir mt-0.5 block text-[11px] font-medium text-[#8B1510] hover:underline" onClick={() => setEditando(true)}>
        ✎ Cambiar fecha
      </button>
    );

  return (
    <span className="no-imprimir mt-1 flex flex-wrap items-center gap-1">
      <input type="date" value={valor} max={hoy} onChange={(x) => setValor(x.target.value)} className="h-7 rounded border border-neutral-400 px-1 text-[12px]" />
      <button
        type="button"
        disabled={pendiente || !valor}
        className="rounded bg-[#8B1510] px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-50"
        onClick={() =>
          startTransition(async () => {
            const r = await fechaDelProtocolo(itemId, servicioId, valor);
            if (r.error) {
              toast.error(r.error, { duration: 9000 });
              return;
            }
            toast.success("Fecha del protocolo guardada");
            setEditando(false);
            router.refresh();
          })
        }
      >
        {pendiente ? <Loader2 className="inline size-3 animate-spin" /> : "Guardar"}
      </button>
      <button type="button" className="text-[11px] text-neutral-600 hover:underline" onClick={() => setEditando(false)}>
        Cancelar
      </button>
    </span>
  );
}
