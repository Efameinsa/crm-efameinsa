import { etiquetaVersion } from "@/lib/version-cotizacion";
import { cn } from "@/lib/utils";

/**
 * La pastilla «v2» junto al número de una cotización corregida (0123).
 *
 * Gerencia, 23-09: «se tiene que dejar claro cuál es la cotización final
 * para evaluación de futuras propuestas». En la lista el número solo ya no
 * alcanza —Presu_569-26 fue dos documentos distintos—, así que el que se ve es
 * la versión vigente y lo dice. La original no dibuja nada.
 */
export function EtiquetaVersion({ version, className }: { version: number | null | undefined; className?: string }) {
  const et = etiquetaVersion(version);
  if (!et) return null;
  return (
    <span
      title={`Corregida: es la versión ${Number(version)}, la final. Las anteriores quedan archivadas.`}
      className={cn(
        "ml-1 inline-flex items-center rounded-sm bg-amber-500/15 px-1 py-px align-middle font-mono text-[10px] font-semibold text-amber-800",
        className,
      )}
    >
      {et}
    </span>
  );
}
