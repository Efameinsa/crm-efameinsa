import { cn } from "@/lib/utils";
import { buscarOpcion, COLOR_INTENCION, INTENCION_COMPRA } from "@/lib/catalogos-ui";

// La escala de color vive en COLOR_INTENCION (src/lib/catalogos-ui.ts), junto
// a las etiquetas, para que el punto de la tabla y el del desplegable no se
// separen nunca. Acá solo el punto + la etiqueta, pensado para caber en una
// fila de tabla o una tarjeta del kanban.

// "Interés de compra" (INT_COMPRA del Excel original) — nunca mostrar
// "sin_definir" como texto crudo.
export function PuntoInteres({ intencion }: { intencion: string }) {
  const o = buscarOpcion(INTENCION_COMPRA, intencion) ?? buscarOpcion(INTENCION_COMPRA, "sin_definir")!;
  const punto = COLOR_INTENCION[intencion] ?? COLOR_INTENCION.sin_definir;
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
