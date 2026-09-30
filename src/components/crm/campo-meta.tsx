"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { guardarMeta } from "@/lib/acciones/metas";

/**
 * Un número de meta que se edita en su sitio. Se guarda con Enter o con el
 * visto; si no cambió, no se guarda nada (y no deja fila en el historial).
 * Para la fecha de arranque el campo es una fecha y viaja como AAAAMMDD.
 */
export function CampoMeta({
  clave,
  valor,
  comercialId,
  sufijo,
  tipo = "numero",
  min,
  max,
  etiqueta,
}: {
  clave: string;
  valor: number | string;
  comercialId?: string;
  sufijo?: string;
  tipo?: "numero" | "fecha";
  min?: number;
  max?: number;
  etiqueta: string;
}) {
  const [texto, setTexto] = useState(String(valor));
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();
  const cambio = texto !== String(valor);

  function guardar() {
    if (!cambio) return;
    const n = tipo === "fecha" ? Number(texto.replaceAll("-", "")) : Number(texto.replace(",", "."));
    startTransition(async () => {
      const { error } = await guardarMeta(clave, n, comercialId);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`${etiqueta}: guardado`);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type={tipo === "fecha" ? "date" : "number"}
        min={min}
        max={max}
        step={1}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") guardar();
          if (e.key === "Escape") setTexto(String(valor));
        }}
        aria-label={etiqueta}
        className={
          "h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums text-foreground " + (tipo === "fecha" ? "w-36" : "w-20")
        }
      />
      {sufijo && <span className="text-xs text-muted-foreground">{sufijo}</span>}
      <button
        type="button"
        onClick={guardar}
        disabled={!cambio || pendiente}
        className="cursor-pointer rounded-md p-1 text-[#1E7F4F] hover:bg-accent disabled:cursor-default disabled:opacity-30"
        title="Guardar"
        aria-label={`Guardar ${etiqueta}`}
      >
        {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      </button>
    </span>
  );
}
