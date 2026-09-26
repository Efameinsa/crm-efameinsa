"use client";

// EL MENÚ EN EL CELULAR Y LA TABLET (26-09). Santos: «el gerente lo revisa
// todo desde su iPhone 17 Pro Max». La barra lateral de 232 px dejaba 200 px
// de pantalla en un teléfono de 440. Debajo de 1024 px la barra se esconde y
// este componente pone dos cosas:
//  · el botón ☰ en la cabecera, que abre el mismo menú como panel deslizable;
//  · en el teléfono (< 768 px), una barra abajo con las cuatro primeras
//    secciones y «Más», al alcance del pulgar, como en una app.
// Los dos van por portal a <body>: la cabecera tiene backdrop-filter y eso
// vuelve relativos a ella los `position: fixed` de adentro.

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarraPropuesta, ICONOS, activa } from "@/components/propuesta/barra-propuesta";
import type { OpcionMenu } from "@/lib/propuesta/menu";

type Props = React.ComponentProps<typeof BarraPropuesta>;

export function MenuMovil(props: Props) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false);

  // El portal necesita <body>, que en el servidor no existe.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- solo marca que ya se puede usar el portal
  useEffect(() => setMontado(true), []);

  // Cerrar con Escape y no dejar que la página de atrás se desplace.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", alTeclear);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = antes;
    };
  }, [abierto]);

  const cerrar = () => setAbierto(false);
  const abajo = props.opciones.slice(0, 4);
  const masActiva = !abajo.some((o) => activa(o, ruta)) && props.opciones.some((o) => activa(o, ruta));

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir el menú"
        className="inline-flex size-9 flex-none items-center justify-center rounded-lg border border-border bg-card text-foreground lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      {montado &&
        createPortal(
          <div className="propuesta lg:hidden">
            {/* Panel deslizable con el menú completo */}
            <div
              className={cn("fixed inset-0 z-50 bg-black/45 transition-opacity duration-200", abierto ? "opacity-100" : "pointer-events-none opacity-0")}
              onClick={cerrar}
              aria-hidden={!abierto}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menú"
              className={cn(
                "fixed inset-y-0 left-0 z-50 flex shadow-2xl transition-transform duration-200 ease-out",
                abierto ? "translate-x-0" : "-translate-x-full",
              )}
            >
              <BarraPropuesta {...props} movil alNavegar={cerrar} />
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar el menú"
                className="absolute right-2 top-2 inline-flex size-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Barra de abajo, solo en el teléfono */}
            <nav
              aria-label="Secciones"
              className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur-md md:hidden"
            >
              <ul className="grid" style={{ gridTemplateColumns: `repeat(${abajo.length + 1}, minmax(0, 1fr))` }}>
                {abajo.map((o) => (
                  <li key={o.href + o.etiqueta}>
                    <ItemAbajo opcion={o} activa={activa(o, ruta)} contador={props.contadores?.[o.href] ?? 0} />
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => setAbierto(true)}
                    className={cn(
                      "flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium",
                      masActiva ? "text-[var(--c-marca)]" : "text-muted-foreground",
                    )}
                  >
                    <MoreHorizontal className="size-5" />
                    Más
                  </button>
                </li>
              </ul>
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}

function ItemAbajo({ opcion, activa: es, contador }: { opcion: OpcionMenu; activa: boolean; contador: number }) {
  const Icono = ICONOS[opcion.icono];
  return (
    <Link
      href={opcion.href}
      aria-current={es ? "page" : undefined}
      className={cn(
        "relative flex h-14 flex-col items-center justify-center gap-0.5 px-1 text-[10.5px] font-medium leading-tight",
        es ? "text-[var(--c-marca)]" : "text-muted-foreground",
      )}
    >
      <Icono className="size-5" strokeWidth={es ? 2.3 : 1.9} />
      <span className="max-w-full truncate">{opcion.etiqueta}</span>
      {contador > 0 && (
        <span className="absolute right-[18%] top-1.5 rounded-full bg-[var(--marca-alto)] px-1 text-[9px] font-bold tabular-nums text-white">
          {contador > 99 ? "99+" : contador}
        </span>
      )}
    </Link>
  );
}
