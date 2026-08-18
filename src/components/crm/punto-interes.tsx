import { cn } from "@/lib/utils";
import { buscarOpcion, INTENCION_COMPRA } from "@/lib/catalogos-ui";

// El color va de más lleno (alto_potencial) a más apagado (bajo) para que
// el orden de intensidad se lea de un vistazo, sin tener que leer la
// etiqueta. El criterio completo de cada nivel vive en INTENCION_COMPRA
// (src/lib/catalogos-ui.ts) — acá solo el punto de color + la etiqueta,
// pensado para caber en una fila de tabla o una tarjeta del kanban.
const PUNTO: Record<string, string> = {
  alto_potencial: "bg-primary",
  medio_alto: "bg-primary/50",
  medio: "bg-amber-500",
  medio_bajo: "bg-amber-500/50",
  bajo: "bg-muted-foreground/40",
  sin_definir: "bg-transparent border border-dashed border-muted-foreground/40",
};

// "Interés de compra" (INT_COMPRA del Excel original) — nunca mostrar
// "sin_definir" como texto crudo.
export function PuntoInteres({ intencion }: { intencion: string }) {
  const o = buscarOpcion(INTENCION_COMPRA, intencion) ?? buscarOpcion(INTENCION_COMPRA, "sin_definir")!;
  const punto = PUNTO[intencion] ?? PUNTO.sin_definir;
  const texto = intencion === "sin_definir" ? "text-muted-foreground" : "text-foreground";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs", texto)}
      title={o.criterio || undefined}
    >
      <span className={cn("size-2 rounded-full", punto)} />
      {o.etiqueta}
    </span>
  );
}
