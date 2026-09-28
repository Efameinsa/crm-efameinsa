import { cn } from "@/lib/utils";
import { colorTipoExpediente, etiquetaTipoExpediente } from "@/lib/tipo-expediente";

/** La etiqueta de color del tipo de expediente (gerencia, 28-09: «que se vea más llamativo»). */
export function TipoExpedienteBadge({ tipo, grande, className }: { tipo: string | null | undefined; grande?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold",
        grande ? "px-3 py-1 text-xs uppercase tracking-wide" : "px-2 py-0.5 text-[11px]",
        colorTipoExpediente(tipo),
        className,
      )}
    >
      {etiquetaTipoExpediente(tipo)}
    </span>
  );
}
