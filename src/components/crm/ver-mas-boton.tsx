"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * «Ver más» que enseña el resultado antes de tenerlo.
 *
 * EL PROBLEMA. Pedir más contactos vuelve a preguntarle al servidor —los
 * contadores de cada cajón se calculan sobre el período entero—, así que hay
 * una espera real. Con un enlace normal, en esa espera no pasaba nada en
 * pantalla y Central lo leyó como que se congelaba (04-09).
 *
 * QUÉ SE HACE, Y QUÉ NO. La respuesta optimista de manual —pintar ya el
 * resultado y corregirlo si el servidor dice otra cosa— acá no cabe: los
 * contactos que faltan no están en el navegador, no hay nada que adivinar.
 * Lo que sí cabe, y es la misma idea, es OCUPAR EL SITIO DE INMEDIATO: al
 * tocar el botón aparecen al instante las tarjetas en gris, del alto que van a
 * tener, y cuando llega la respuesta se cambian por las de verdad. La página
 * crece en el mismo momento del clic, que es lo que la persona necesita ver.
 *
 * Y el tramo siguiente se pide APENAS APARECE el botón, no cuando lo tocan:
 * para cuando se llega al final de la lista, la respuesta suele estar ya en el
 * navegador y las tarjetas grises ni alcanzan a verse.
 */
export function VerMas({
  hrefMas,
  hrefTodos,
  mostrar,
  total,
  tanda,
}: {
  hrefMas: string;
  hrefTodos: string;
  /** Cuántas hay pintadas ahora. */
  mostrar: number;
  /** Cuántas hay en total en este cajón. */
  total: number;
  /** De cuántas en cuántas se pide. */
  tanda: number;
}) {
  const router = useRouter();
  const [cargando, empezar] = useTransition();
  const restantes = total - mostrar;
  const proximas = Math.min(tanda, restantes);

  useEffect(() => {
    router.prefetch(hrefMas);
  }, [router, hrefMas]);

  return (
    <>
      {/* El hueco de lo que viene, dibujado en el mismo clic. Se muestran hasta
          seis: con eso ya se ve que la página creció, y más sería pintar por
          pintar. */}
      {cargando && (
        <div className="mt-2 space-y-2" aria-hidden>
          {Array.from({ length: Math.min(proximas, 6) }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="h-4 w-48 rounded bg-muted" />
                <div className="ml-auto h-4 w-24 rounded bg-muted" />
              </div>
              <div className="mt-3 h-3 w-full rounded bg-muted" />
              <div className="mt-1.5 h-3 w-2/3 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 rounded-lg border border-dashed border-border py-3 text-xs">
        <span className="text-muted-foreground">
          Se ven {mostrar} de {total}
        </span>
        <button
          type="button"
          disabled={cargando}
          onClick={() => empezar(() => router.push(hrefMas, { scroll: false }))}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground transition-opacity hover:bg-primary/90 disabled:opacity-70"
        >
          {cargando ? "Trayendo…" : `Ver ${proximas} más`}
        </button>
        <button
          type="button"
          disabled={cargando}
          onClick={() => empezar(() => router.push(hrefTodos, { scroll: false }))}
          className="text-muted-foreground underline-offset-2 transition-opacity hover:underline disabled:opacity-70"
        >
          ver los {restantes} restantes
        </button>
      </div>
    </>
  );
}
