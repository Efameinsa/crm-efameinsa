"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserCheck, X } from "lucide-react";
import { cubrirA, terminarCobertura } from "@/lib/acciones/expediente-postventa";
import { Button } from "@/components/ui/button";

/** El formulario de «Hoy cubro a…» (0530): a quién y hasta cuándo. */
export function CubrirAForm({ companeras, hoy }: { companeras: { id: string; nombre: string }[]; hoy: string }) {
  const router = useRouter();
  const [ausente, setAusente] = useState(companeras[0]?.id ?? "");
  const [hasta, setHasta] = useState(hoy);
  const [pendiente, startTransition] = useTransition();
  if (companeras.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium text-foreground">Hoy cubro a</span>
      <select
        value={ausente}
        onChange={(e) => setAusente(e.target.value)}
        className="h-8 rounded-md border border-border bg-card px-2 text-xs"
        aria-label="Compañera a cubrir"
      >
        {companeras.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">hasta el</span>
      <input
        type="date"
        min={hoy}
        value={hasta}
        onChange={(e) => setHasta(e.target.value)}
        className="h-8 rounded-md border border-border bg-card px-2 text-xs"
        aria-label="Hasta"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={pendiente || !ausente}
        onClick={() =>
          startTransition(async () => {
            const r = await cubrirA(ausente, hasta);
            if (r.error) return void toast.error(r.error);
            toast.success("Listo: le llegará copia de sus avisos y verá sus pendientes aquí.");
            router.refresh();
          })
        }
      >
        {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <UserCheck className="size-3.5" />}
        Cubrir
      </Button>
      <span className="text-[11px] text-muted-foreground">Para cuando una compañera falta: sus casos no se mueven.</span>
    </div>
  );
}

export function TerminarCoberturaBoton({ id }: { id: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pendiente}
      onClick={() =>
        startTransition(async () => {
          const r = await terminarCobertura(id);
          if (r.error) return void toast.error(r.error);
          toast.success("Cobertura terminada.");
          router.refresh();
        })
      }
    >
      {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
      Ya volvió
    </Button>
  );
}
