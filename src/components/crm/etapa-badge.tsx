import { cn } from "@/lib/utils";

const CONFIG: Record<string, { etiqueta: string; clases: string }> = {
  asignada: { etiqueta: "Asignada", clases: "bg-secondary text-foreground" },
  filtrada: { etiqueta: "Filtrada", clases: "bg-secondary text-foreground" },
  cotizada: { etiqueta: "Cotizada", clases: "bg-amber-500/10 text-amber-700" },
  seguimiento: { etiqueta: "Seguimiento", clases: "bg-secondary text-foreground" },
  potencial: { etiqueta: "Potencial", clases: "bg-primary/10 text-primary" },
  venta: { etiqueta: "Venta", clases: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  rechazada: { etiqueta: "Rechazada", clases: "bg-destructive/10 text-destructive" },
  derivada: { etiqueta: "Derivada", clases: "bg-secondary text-muted-foreground" },
};

export function EtapaBadge({ etapa }: { etapa: string }) {
  const c = CONFIG[etapa] ?? { etiqueta: etapa, clases: "bg-secondary text-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold", c.clases)}>
      {c.etiqueta}
    </span>
  );
}
