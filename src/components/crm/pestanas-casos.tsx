import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * LA TIRA ÚNICA DEL TRABAJO TÉCNICO.
 *
 * Hasta el 08-09 el menú del área tenía dos entradas para lo mismo: «Bandeja»
 * (lo que llegó y nadie tomó) y «Casos» (todo lo abierto, más cerradas,
 * históricos y casos anteriores). Son la misma cola mirada en dos momentos, y
 * el tester de UI/UX lo dijo sin rodeos: no sabía en cuál de las dos tenía que
 * estar, y contó dos números distintos de «casos abiertos» según por dónde
 * entrara.
 *
 * Se unifica la PUERTA, no el dato: `/postventa` sigue siendo la bandeja y
 * `/postventa/atenciones` sigue siendo la pista de nueve etapas. Lo que cambia
 * es que las dos pantallas muestran esta misma tira arriba, así que desde
 * cualquiera se llega a la otra en un clic y el menú necesita una sola entrada.
 * Es el mismo criterio del plan 23 (cuatro puertas → una) y el de Despachos,
 * que el 08-09 pasó a ser una pestaña de Pedidos.
 */

export type PestanaCasos = "bandeja" | "" | "casos" | "cerradas" | "historico";

const PESTANAS: { clave: PestanaCasos; etiqueta: string; href: string }[] = [
  // Primero lo que exige una decisión hoy: lo que llegó y nadie tomó.
  { clave: "bandeja", etiqueta: "Por tomar", href: "/postventa" },
  { clave: "", etiqueta: "Abiertas", href: "/postventa/atenciones" },
  { clave: "casos", etiqueta: "Casos anteriores", href: "/postventa/atenciones?ver=casos" },
  { clave: "cerradas", etiqueta: "Cerradas", href: "/postventa/atenciones?ver=cerradas" },
  { clave: "historico", etiqueta: "Histórico", href: "/postventa/atenciones?ver=historico" },
];

export function PestanasCasos({
  activa,
  abiertas,
  enRojo = 0,
  porTomar,
}: {
  activa: PestanaCasos;
  /** Cuántas siguen abiertas. Se omite donde la pantalla no las cuenta. */
  abiertas?: number;
  enRojo?: number;
  /** Cuántas esperan que alguien las tome. */
  porTomar?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PESTANAS.map((p) => (
        <Link
          key={p.clave || "abiertas"}
          href={p.href}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
            activa === p.clave
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground",
          )}
        >
          {p.etiqueta}
          {p.clave === "bandeja" && porTomar != null && ` (${porTomar})`}
          {p.clave === "" && abiertas != null && ` (${abiertas})`}
          {p.clave === "" && enRojo > 0 && (
            <span className="ml-1 text-destructive" title="pasadas de su límite">
              · {enRojo} vencidas
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
