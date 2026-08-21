"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buscarOpcion, type OpcionConCriterio } from "@/lib/catalogos-ui";

// Punto de color de la opción, cuando el catálogo define una escala. Fuera del
// componente para no recrearlo en cada render.
function Punto({ color }: { color?: string }) {
  if (!color) return null;
  return <span className={cn("size-2 flex-none rounded-full", color)} aria-hidden />;
}

// A diferencia del <Select> genérico de ui/select.tsx, este SIEMPRE muestra
// el criterio de cada opción dentro del propio desplegable (dos líneas por
// opción), y el de la opción elegida queda visible debajo del campo tras
// cerrar. Decisión de diseño (no un tooltip al pasar el puntero): el
// tooltip no funciona en tablet ni con teclado, y quien más necesita leer
// el criterio —el usuario nuevo— es justo quien no sabe que hay que pasar
// el mouse por encima para verlo.
export function SelectConCriterio({
  id,
  opciones,
  value,
  onValueChange,
  placeholder = "Seleccione…",
  className,
}: {
  id?: string;
  opciones: OpcionConCriterio[];
  value: string;
  onValueChange: (valor: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const seleccionada = buscarOpcion(opciones, value);

  return (
    <div className={cn("space-y-1", className)}>
      <SelectPrimitive.Root value={value} onValueChange={(v) => v != null && onValueChange(String(v))}>
        <SelectPrimitive.Trigger
          id={id}
          className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none select-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-placeholder:text-muted-foreground"
        >
          {/* Sin este render, Base UI imprime el VALOR crudo del enum
              ("alto_potencial", "sin_definir") y la etiqueta bonita solo
              aparecía al abrir el desplegable. */}
          <SelectPrimitive.Value placeholder={placeholder}>
            {(valor) => {
              const o = buscarOpcion(opciones, valor == null ? "" : String(valor));
              if (!o) return placeholder;
              return (
                <span className="flex min-w-0 items-center gap-2">
                  <Punto color={o.color} />
                  <span className="truncate">{o.etiqueta}</span>
                </span>
              );
            }}
          </SelectPrimitive.Value>
          <SelectPrimitive.Icon render={<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />} />
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Positioner className="isolate z-50" sideOffset={4}>
            <SelectPrimitive.Popup className="relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-64 origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              <SelectPrimitive.List className="p-1">
                {opciones.map((o) => (
                  <SelectPrimitive.Item
                    key={o.valor}
                    value={o.valor}
                    className="relative flex w-full cursor-default flex-col gap-0.5 rounded-md py-1.5 pr-8 pl-2.5 outline-hidden select-none focus:bg-accent"
                  >
                    <SelectPrimitive.ItemText className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Punto color={o.color} />
                      {o.etiqueta}
                    </SelectPrimitive.ItemText>
                    {o.criterio && (
                      <span className={cn("text-xs leading-snug text-muted-foreground", o.color && "pl-4")}>
                        {o.criterio}
                      </span>
                    )}
                    <SelectPrimitive.ItemIndicator className="pointer-events-none absolute top-1.5 right-2 flex size-4 items-center justify-center">
                      <CheckIcon className="size-3.5 text-primary" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.List>
            </SelectPrimitive.Popup>
          </SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>

      {seleccionada?.criterio && (
        <p className={cn("text-xs leading-snug text-muted-foreground", seleccionada.color ? "pl-4" : "px-0.5")}>
          {seleccionada.criterio}
        </p>
      )}
    </div>
  );
}
