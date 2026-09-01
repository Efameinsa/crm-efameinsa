"use client";

import { Button } from "@/components/ui/button";

/** Imprimir (o «Guardar como PDF») la página actual: el camino HTML → Edge → PDF de la empresa. */
export function BotonImprimir({ children }: { children: React.ReactNode }) {
  return (
    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => window.print()}>
      {children}
    </Button>
  );
}
