"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  ClipboardList,
  KanbanSquare,
  Building2,
  FileText,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  Users,
  Package,
  BookMarked,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RolUsuario } from "@/types/database";

const ENLACES_POR_ROL: Record<RolUsuario, { href: string; etiqueta: string; icono: LucideIcon }[]> = {
  central: [
    { href: "/central", etiqueta: "Bandeja", icono: Inbox },
    { href: "/central/captura", etiqueta: "Registrar contacto", icono: ClipboardList },
  ],
  comercial: [
    { href: "/comercial", etiqueta: "Mi día", icono: ClipboardList },
    { href: "/comercial/oportunidades", etiqueta: "Mis oportunidades", icono: KanbanSquare },
    { href: "/comercial/cartera", etiqueta: "Mi cartera", icono: Building2 },
  ],
  gerencia: [
    { href: "/gerencia", etiqueta: "Panel comercial", icono: BarChart3 },
    { href: "/gerencia/clientes", etiqueta: "Clientes", icono: Building2 },
    { href: "/gerencia/marketing", etiqueta: "Panel de marketing", icono: TrendingUp },
    { href: "/gerencia/aprobaciones", etiqueta: "Aprobaciones", icono: CheckCircle2 },
    { href: "/gerencia/cartera-liberable", etiqueta: "Cartera liberable", icono: FileText },
  ],
  admin: [
    { href: "/admin", etiqueta: "Usuarios", icono: Users },
    { href: "/admin/productos", etiqueta: "Productos y precios", icono: Package },
    { href: "/admin/catalogos", etiqueta: "Catálogos", icono: BookMarked },
  ],
};

export function NavLateral({ rol }: { rol: RolUsuario }) {
  const pathname = usePathname();
  const enlaces = ENLACES_POR_ROL[rol];

  // El enlace activo es el de coincidencia más específica (más larga), no
  // solo el primero cuyo prefijo calce — así una ruta anidada como
  // /comercial/cartera/<id> resalta "Mi cartera" y no "Mi día".
  const activoHref = enlaces
    .filter((e) => pathname === e.href || pathname.startsWith(e.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {enlaces.map((enlace) => {
        const activo = enlace.href === activoHref;
        const Icono = enlace.icono;
        return (
          <Link
            key={enlace.href}
            href={enlace.href}
            className={cn(
              "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150",
              activo
                ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            {activo && (
              <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[var(--efameinsa-granate)]" />
            )}
            <Icono className="size-4 shrink-0" />
            {enlace.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
