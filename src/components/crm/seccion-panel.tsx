/**
 * Igual que SeccionPanel pero plegada de entrada (C5 del plan 11: la ficha de
 * oportunidad absorbió las secciones que antes vivían en "Ver ficha completa",
 * y si se mostraran todas abiertas la pantalla de trabajo quedaría enterrada).
 *
 * Usa <details>/<summary> nativo a propósito: funciona sin JavaScript, así que
 * esto sigue siendo un Server Component y el navegador se encarga de abrir y
 * cerrar. `cantidad` va en el encabezado para poder decidir si vale la pena
 * abrirla sin abrirla.
 */
export function SeccionPlegable({
  titulo,
  cantidad,
  accion,
  children,
  abiertaPorDefecto = false,
}: {
  titulo: string;
  cantidad?: number;
  accion?: React.ReactNode;
  children: React.ReactNode;
  abiertaPorDefecto?: boolean;
}) {
  return (
    <details open={abiertaPorDefecto} className="group rounded-xl border border-border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-foreground">
          <span className="text-muted-foreground transition-transform group-open:rotate-90">▸</span>
          {titulo}
          {cantidad !== undefined && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">
              {cantidad}
            </span>
          )}
        </h2>
        {accion}
      </summary>
      <div className="border-t border-border p-5">{children}</div>
    </details>
  );
}

export function SeccionPanel({
  titulo,
  accion,
  children,
  id,
}: {
  titulo: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
  /** Ancla, para poder enlazar directo a la sección (ej. #cotizador). */
  id?: string;
}) {
  return (
    <div id={id} className="scroll-mt-4 rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-foreground">{titulo}</h2>
        {accion}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
