import { cn } from "@/lib/utils";

const CONFIG: Record<string, { etiqueta: string; punto: string; texto: string }> = {
  alta: { etiqueta: "Alta", punto: "bg-primary", texto: "text-foreground" },
  media: { etiqueta: "Media", punto: "bg-amber-500", texto: "text-foreground" },
  baja: { etiqueta: "Baja", punto: "bg-muted-foreground/40", texto: "text-foreground" },
  sin_definir: { etiqueta: "Sin calificar", punto: "bg-transparent border border-dashed border-muted-foreground/40", texto: "text-muted-foreground" },
};

// "Interés de compra" (INT_COMPRA del Excel original) — nunca mostrar
// "sin_definir" como texto crudo.
export function PuntoInteres({ intencion }: { intencion: string }) {
  const c = CONFIG[intencion] ?? CONFIG.sin_definir;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", c.texto)}>
      <span className={cn("size-2 rounded-full", c.punto)} />
      {c.etiqueta}
    </span>
  );
}
