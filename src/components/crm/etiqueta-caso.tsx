import { colorDeCaso } from "@/lib/colores-caso";
import { cn } from "@/lib/utils";

/** La etiqueta de color de un caso (gerencia 20-10: «para cada caso un color»). */
export function EtiquetaCaso({ codigo, className }: { codigo: string; className?: string }) {
  const c = colorDeCaso(codigo);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-px text-[10px] font-bold", c.fondo, c.texto, className)}>
      <span className={cn("size-1.5 rounded-full", c.punto)} />
      {codigo}
    </span>
  );
}
