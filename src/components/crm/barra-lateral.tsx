"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLateral } from "@/components/crm/nav-lateral";
import { PinSupervisor } from "@/components/crm/pin-supervisor";
import { cn } from "@/lib/utils";
import type { RolUsuario } from "@/types/database";

/**
 * La barra lateral, plegable con un clic (pedido 25-08: «el sidebar debería
 * poder contraerse y soltarse para aprovechar más el espacio de gestión»).
 *
 * En un laptop, los 240 px de la barra compiten con la tabla del cotizador y
 * con el Kanban; plegada queda en 56 px —solo los íconos, con su nombre en el
 * tooltip— y la pantalla de trabajo gana el resto.
 *
 * La preferencia se guarda en el navegador y se aplica DESPUÉS del primer
 * render: leer localStorage durante el render del servidor no existe, y
 * hacerlo en el primero del cliente desincroniza la hidratación. El parpadeo
 * de una fracción de segundo es el precio de que el HTML del servidor y el del
 * cliente sean idénticos.
 */
const CLAVE = "crm-sidebar-plegada";

export function BarraLateral({
  rol,
  esPostventa,
  hacePostventa = false,
  esSoporte = false,
}: {
  rol: RolUsuario;
  esPostventa: boolean;
  hacePostventa?: boolean;
  esSoporte?: boolean;
}) {
  const [plegada, setPlegada] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE) === "1") setPlegada(true);
    } catch {
      // navegación privada o storage bloqueado: se queda abierta, sin drama
    }
  }, []);

  function alternar() {
    setPlegada((v) => {
      try {
        localStorage.setItem(CLAVE, v ? "0" : "1");
      } catch {
        // sin persistencia, pero el clic igual funciona en esta sesión
      }
      return !v;
    });
  }

  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        plegada ? "w-14" : "w-60",
      )}
    >
      <div className={cn("flex h-[120px] flex-none items-center justify-center", plegada ? "px-1" : "px-4")}>
        <Image
          src="/efameinsa-blanco.png"
          alt="Efameinsa"
          width={442}
          height={334}
          className={cn("w-auto", plegada ? "h-8" : "h-20")}
          priority
        />
      </div>
      <NavLateral rol={rol} esPostventa={esPostventa} hacePostventa={hacePostventa} esSoporte={esSoporte} plegada={plegada} />

      {/* El código con el que gerencia autoriza que Central corrija una
          derivación (0092). Vive acá porque es donde el supervisor lo tiene a
          mano cuando lo llaman, sin salir de lo que estaba haciendo. */}
      {(rol === "gerencia" || rol === "admin") && <PinSupervisor plegada={plegada} />}

      {/* A continuación de la lista, como un ítem más — pegado al borde
          inferior de la pantalla nadie lo veía (reportado 25-08). */}
      <div className="px-3">
        <button
          type="button"
          onClick={alternar}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-dashed border-sidebar-accent/60 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            plegada ? "justify-center px-0" : "px-3",
          )}
          title={plegada ? "Expandir el menú" : "Contraer el menú"}
          aria-label={plegada ? "Expandir el menú" : "Contraer el menú"}
        >
          {plegada ? <PanelLeftOpen className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
          {!plegada && "Contraer"}
        </button>
      </div>
    </aside>
  );
}
