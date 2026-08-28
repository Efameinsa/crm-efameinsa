import Link from "next/link";
import { Cpu } from "lucide-react";
import { seriesDeTexto } from "@/lib/postventa";
import { cn } from "@/lib/utils";

/**
 * La descripción del equipo con sus series convertidas en enlaces.
 *
 * «El número de serie acá es vital: trabajamos con el número de serie siendo el
 * patrón para toda la trazabilidad» (Carlos, 27-08). En la ficha del pedido esa
 * serie estaba escrita como texto muerto, en el medio de un renglón que dice
 * «MARCA: SAILSTAR / MODELO: SS40 / CAPACIDAD: 40KG / SERIE: Z0090622 / MARCA:
 * UNIMAC / …» — dos máquinas amontonadas en una línea gris. Si es el eje de la
 * trazabilidad, tiene que llevar a algún lado.
 *
 * Cuando la máquina ya está fichada, la serie abre su ficha: garantía, ciclos,
 * historial. Cuando todavía no, se resalta igual —es el dato que identifica la
 * máquina— y se ve que falta ficharla.
 */
export function EquipoConSeries({
  texto,
  fichaPorSerie,
  className,
}: {
  texto: string | null;
  /** serie en mayúsculas → id del equipo instalado */
  fichaPorSerie: Map<string, string>;
  className?: string;
}) {
  if (!texto) return <p className={cn("text-xs text-muted-foreground", className)}>Sin equipo</p>;

  const series = seriesDeTexto(texto);
  if (series.length === 0) {
    return <p className={cn("whitespace-pre-line text-xs text-muted-foreground", className)}>{texto}</p>;
  }

  const patron = new RegExp(`(${series.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");

  return (
    <p className={cn("whitespace-pre-line text-xs text-muted-foreground", className)}>
      {texto.split(patron).map((trozo, i) => {
        const id = fichaPorSerie.get(trozo.toUpperCase());
        if (id) {
          return (
            <Link
              key={i}
              href={`/postventa/equipos/${id}`}
              className="inline-flex items-center gap-0.5 font-mono font-semibold text-primary hover:underline"
            >
              <Cpu className="size-3" />
              {trozo}
            </Link>
          );
        }
        return series.includes(trozo.toUpperCase()) ? (
          <span key={i} className="font-mono font-semibold text-foreground" title="Todavía sin ficha en el parque instalado">
            {trozo}
          </span>
        ) : (
          <span key={i}>{trozo}</span>
        );
      })}
    </p>
  );
}
