"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLateral } from "@/components/crm/nav-lateral";
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

export function BarraLateral({ rol, esPostventa }: { rol: RolUsuario; esPostventa: boolean }) {
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
      <div className={cn("flex items-center justify-center py-5", plegada ? "px-1" : "px-4")}>
        <Image
          src="/efameinsa-blanco.png"
          alt="Efameinsa"
          width={442}
          height={334}
          className={cn("w-auto", plegada ? "h-8" : "h-20")}
          priority
        />
      </div>
      <NavLateral rol={rol} esPostventa={esPostventa} plegada={plegada} />
      <button
        type="button"
        onClick={alternar}
        className="mt-auto flex cursor-pointer items-center justify-center gap-2 border-t border-sidebar-accent/40 px-3 py-3 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        title={plegada ? "Expandir el menú" : "Contraer el menú"}
        aria-label={plegada ? "Expandir el menú" : "Contraer el menú"}
      >
        {plegada ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        {!plegada && "Contraer menú"}
      </button>
    </aside>
  );
}
