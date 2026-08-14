"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { RolUsuario } from "@/types/database";

const ENLACES_POR_ROL: Record<RolUsuario, { href: string; etiqueta: string }[]> = {
  central: [
    { href: "/central", etiqueta: "Bandeja" },
    { href: "/central/captura", etiqueta: "Registrar contacto" },
  ],
  comercial: [
    { href: "/comercial", etiqueta: "Mi día" },
    { href: "/comercial/oportunidades", etiqueta: "Mis oportunidades" },
  ],
  gerencia: [
    { href: "/gerencia", etiqueta: "Panel comercial" },
    { href: "/gerencia/marketing", etiqueta: "Panel de marketing" },
    { href: "/gerencia/aprobaciones", etiqueta: "Aprobaciones" },
    { href: "/gerencia/cartera-liberable", etiqueta: "Cartera liberable" },
  ],
  admin: [
    { href: "/admin", etiqueta: "Usuarios" },
    { href: "/admin/productos", etiqueta: "Productos y precios" },
    { href: "/admin/catalogos", etiqueta: "Catálogos" },
  ],
};

export function NavLateral({ rol }: { rol: RolUsuario }) {
  const pathname = usePathname();
  const enlaces = ENLACES_POR_ROL[rol];

  return (
    <nav className="flex flex-col gap-1 p-3">
      {enlaces.map((enlace) => {
        const activo = pathname === enlace.href;
        return (
          <Link
            key={enlace.href}
            href={enlace.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
              activo
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            {enlace.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
