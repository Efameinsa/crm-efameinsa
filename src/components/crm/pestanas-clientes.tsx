import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * CLIENTE Y MÁQUINA, LA MISMA PREGUNTA.
 *
 * «Clientes que atiendo» y «Parque instalado» eran dos entradas del menú para
 * la misma pregunta —a quién atiendo y qué tiene puesto— con dos buscadores
 * distintos: uno por razón social y RUC, el otro por serie. El área entra por
 * uno de los dos según lo que le dijo el cliente por teléfono («soy la clínica
 * tal» o «mi lavadora 4521 falla»), y hasta el 08-09 tenía que volver al menú
 * para cambiar de idea.
 *
 * Es la misma unificación de puerta que ya se hizo con Casos y con Despachos:
 * las dos pantallas quedan como estaban, el menú lleva una sola entrada y se
 * salta de una a la otra en un clic. Solo la ve postventa: el comercial no
 * tiene parque.
 */

const PESTANAS = [
  { clave: "clientes" as const, etiqueta: "Clientes", href: "/comercial/cartera" },
  { clave: "maquinas" as const, etiqueta: "Máquinas instaladas", href: "/postventa/equipos" },
];

export function PestanasClientes({
  activa,
  clientes,
  maquinas,
}: {
  activa: "clientes" | "maquinas";
  /** El total de cada lado; solo se muestra el que la pantalla sabe contar. */
  clientes?: number;
  maquinas?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PESTANAS.map((p) => (
        <Link
          key={p.clave}
          href={p.href}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
            activa === p.clave
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground",
          )}
        >
          {p.etiqueta}
          {p.clave === "clientes" && clientes != null && ` (${clientes.toLocaleString("es-PE")})`}
          {p.clave === "maquinas" && maquinas != null && ` (${maquinas.toLocaleString("es-PE")})`}
        </Link>
      ))}
    </div>
  );
}
