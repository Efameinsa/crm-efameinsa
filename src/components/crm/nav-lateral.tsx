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
  Gauge,
  CalendarDays,
  ClipboardCheck,
  PiggyBank,
  PackageCheck,
  Send,
  Wrench,
  LifeBuoy,
  Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RolUsuario } from "@/types/database";

const ENLACES_POR_ROL: Record<RolUsuario, { href: string; etiqueta: string; icono: LucideIcon }[]> = {
  central: [
    { href: "/central", etiqueta: "Bandeja", icono: Inbox },
    { href: "/central/captura", etiqueta: "Registrar contacto", icono: ClipboardList },
    // El informe de cierre se le manda a Central para facturar, cobrar y
    // despachar: hasta ahora era la única que no tenía dónde verlo.
    { href: "/central/derivados", etiqueta: "Lo que derivé", icono: Send },
    { href: "/central/cierres", etiqueta: "Cierres de venta", icono: PackageCheck },
    { href: "/central/informe", etiqueta: "Informe del día", icono: FileText },
  ],
  // Orden pedido por Darwin el 23-08 (plan 11, C2): el día arranca en "Mi
  // día", sigue por la agenda y el tercer sitio es "Mis oportunidades" —
  // «es lo que tienes que revisar diariamente»—; la gestión y la cartera se
  // consultan, no se trabajan a diario.
  comercial: [
    { href: "/comercial", etiqueta: "Mi día", icono: ClipboardList },
    { href: "/comercial/agenda", etiqueta: "Mi agenda", icono: CalendarDays },
    { href: "/comercial/oportunidades", etiqueta: "Mis oportunidades", icono: KanbanSquare },
    { href: "/comercial/cotizaciones", etiqueta: "Mis cotizaciones", icono: FileText },
    { href: "/comercial/potenciales", etiqueta: "Mis potenciales", icono: Target },
    { href: "/comercial/mi-gestion", etiqueta: "Mi gestión", icono: Gauge },
    { href: "/comercial/cartera", etiqueta: "Mi cartera", icono: Building2 },
  ],
  gerencia: [
    { href: "/gerencia", etiqueta: "Panel comercial", icono: BarChart3 },
    { href: "/gerencia/supervision", etiqueta: "Supervisión diaria", icono: ClipboardCheck },
    { href: "/gerencia/potenciales", etiqueta: "Potenciales", icono: Target },
    { href: "/gerencia/clientes", etiqueta: "Clientes", icono: Building2 },
    { href: "/gerencia/marketing", etiqueta: "Panel de marketing", icono: TrendingUp },
    { href: "/gerencia/finanzas", etiqueta: "Finanzas de mkt", icono: PiggyBank },
    { href: "/gerencia/aprobaciones", etiqueta: "Aprobaciones", icono: CheckCircle2 },
    { href: "/gerencia/cartera-liberable", etiqueta: "Cartera liberable", icono: FileText },
  ],
  admin: [
    { href: "/admin", etiqueta: "Usuarios", icono: Users },
    { href: "/admin/productos", etiqueta: "Productos y precios", icono: Package },
    { href: "/admin/catalogos", etiqueta: "Catálogos", icono: BookMarked },
  ],
};

// Postventa entra como un comercial más —«le das el acceso a la parte
// comercial, o sea, como si fuera un comercial» (Carlos, 25-08)— pero su día no
// es vender: es responder garantías, cotizar repuestos y seguir despachos y
// puestas en marcha. Por eso conserva las herramientas comerciales y suma las
// dos pantallas suyas arriba, que es lo que abre al llegar.
const ENLACES_POSTVENTA = [
  { href: "/postventa", etiqueta: "Mi día", icono: Wrench },
  { href: "/postventa/agenda", etiqueta: "Agenda de despachos", icono: CalendarDays },
  { href: "/postventa/equipos", etiqueta: "Equipos instalados", icono: Package },
  { href: "/postventa/soporte", etiqueta: "Soporte técnico", icono: LifeBuoy },
  { href: "/comercial/oportunidades", etiqueta: "Mis casos", icono: KanbanSquare },
  { href: "/comercial/cartera", etiqueta: "Clientes", icono: Building2 },
];

// Las pantallas del área, sin las dos comerciales que ENLACES_POSTVENTA suma
// para la cuenta PV: un comercial ya las tiene arriba y repetirlas confundiría.
const ENLACES_AREA_POSTVENTA = ENLACES_POSTVENTA.filter((e) => e.href.startsWith("/postventa"));

export function NavLateral({
  rol,
  esPostventa = false,
  hacePostventa = false,
  plegada = false,
}: {
  rol: RolUsuario;
  esPostventa?: boolean;
  /**
   * Comercial que además atiende postventa de sus clientes (migración 0093).
   * A diferencia de `esPostventa`, no le cambia el mundo: le SUMA una sección.
   * Cambiarle la barra entera a alguien por tener un segundo sombrero lo
   * desorienta, y además le sacaría las herramientas con las que vende.
   */
  hacePostventa?: boolean;
  /** Barra contraída: solo íconos, el nombre va al tooltip. */
  plegada?: boolean;
}) {
  const pathname = usePathname();
  const base = esPostventa ? ENLACES_POSTVENTA : ENLACES_POR_ROL[rol];
  const extra = !esPostventa && hacePostventa ? ENLACES_AREA_POSTVENTA : [];
  const enlaces = [...base, ...extra];

  // El enlace activo es el de coincidencia más específica (más larga), no
  // solo el primero cuyo prefijo calce — así una ruta anidada como
  // /comercial/cartera/<id> resalta "Mi cartera" y no "Mi día".
  const activoHref = enlaces
    .filter((e) => pathname === e.href || pathname.startsWith(e.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {enlaces.map((enlace, i) => {
        const activo = enlace.href === activoHref;
        const Icono = enlace.icono;
        // El rótulo va una sola vez, arriba del primer enlace del área. Es una
        // etiqueta y no solo un color a propósito: se lee igual en blanco y
        // negro y para quien no distingue bien los tonos.
        const abreSeccion = extra.length > 0 && i === base.length;
        return (
          <div key={enlace.href} className="contents">
            {abreSeccion &&
              (plegada ? (
                <hr className="my-2 border-sidebar-border" />
              ) : (
                <p className="mt-4 mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/45">
                  Postventa
                </p>
              ))}
          <Link
            href={enlace.href}
            title={plegada ? enlace.etiqueta : undefined}
            className={cn(
              "relative flex items-center gap-2.5 rounded-md py-2 text-sm transition-colors duration-150",
              plegada ? "justify-center px-0" : "px-3",
              activo
                ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            {activo && (
              <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[var(--efameinsa-granate)]" />
            )}
            <Icono className={cn("size-4 shrink-0", i >= base.length && !activo && "text-[#4A6670]")} />
            {!plegada && enlace.etiqueta}
          </Link>
          </div>
        );
      })}
    </nav>
  );
}
