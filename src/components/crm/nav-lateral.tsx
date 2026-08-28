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
  Route,
  ShieldCheck,
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
    { href: "/gerencia/reportes", etiqueta: "Cierre del día", icono: FileText },
    { href: "/gerencia/accesos", etiqueta: "Accesos y equipos", icono: ShieldCheck },
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
// pantallas suyas arriba, que es lo que abre al llegar.
//
// Tres nombres cambiaron el 27-08, y los tres porque el nombre le mintió a
// Carlos mientras miraba la pantalla:
//   · «Agenda de despachos» → **Calendario**: él mismo lo rebautizó al pedir
//     verlo por semana —«¿qué voy a hacer mañana, qué voy a hacer en la
//     semana?»—; «agenda» le sonaba a lista informativa, y lo era.
//   · «Soporte técnico» → **Casos**: es la palabra con la que Central ya deriva.
//   · «Mis casos» → **Mis ventas de servicio**: preguntó textual «¿qué viene a
//     ser mis casos?». Son sus oportunidades de mantenimiento y repuestos, no
//     los casos técnicos — que ahora sí se llaman así.
const ENLACES_POSTVENTA = [
  { href: "/postventa", etiqueta: "Mi día", icono: Wrench },
  // Carlos lo pidió entrando con la cuenta de Hever el 28-08 a las 10:10:
  // «¿en postventa no tenemos agenda?… ¿dónde genero mi agenda?». El calendario
  // responde cuándo se atiende a un cliente; la agenda es otra cosa —es donde
  // están el reporte del día y el cierre de la semana— y al armarle el menú del
  // área se la habíamos quitado.
  { href: "/comercial/agenda", etiqueta: "Mi agenda", icono: ClipboardList },
  { href: "/postventa/agenda", etiqueta: "Calendario", icono: CalendarDays },
  { href: "/postventa/casos", etiqueta: "Casos", icono: LifeBuoy },
  { href: "/postventa/equipos", etiqueta: "Equipos instalados", icono: Package },
  { href: "/comercial/ruta", etiqueta: "Ruta de mantenimiento", icono: Route },
  { href: "/comercial/oportunidades", etiqueta: "Mis ventas de servicio", icono: KanbanSquare },
  { href: "/comercial/cartera", etiqueta: "Clientes", icono: Building2 },
];

// Lo único que un comercial que además vende mantenimiento (`hace_postventa`,
// 0093) ve de más: su campaña. No es una pantalla del área —no ejecuta nada—,
// es su pipeline mirado como campaña de llamadas.
const ENLACE_RUTA = { href: "/comercial/ruta", etiqueta: "Ruta de mantenimiento", icono: Route };

export function NavLateral({
  rol,
  esPostventa = false,
  hacePostventa = false,
  esSoporte = false,
  plegada = false,
}: {
  rol: RolUsuario;
  esPostventa?: boolean;
  /**
   * Acompaña a los usuarios (0101): ve las dos barras porque su trabajo es que
   * los demás sepan usarlas.
   */
  esSoporte?: boolean;
  /**
   * Comercial que además vende mantenimiento y repuestos (migración 0093).
   * Le suma un enlace, no le cambia la barra: sigue siendo comercial.
   */
  hacePostventa?: boolean;
  /** Barra contraída: solo íconos, el nombre va al tooltip. */
  plegada?: boolean;
}) {
  const pathname = usePathname();
  // Un comercial que además vende mantenimiento ve la barra de un comercial
  // más su ruta, y nada del área. Hasta el 27-08 se le sumaban las cuatro
  // pantallas de postventa, y Carlos lo cortó mirando el menú de Ariana: ella
  // vende el servicio y ahí termina su trabajo —«yo no tengo nada que ver con
  // cuándo lo vas a ejecutar»—. Despachos, equipos instalados y casos son de
  // quien ejecuta, no de quien vende.
  // La cuenta de soporte (0101) ve las dos barras: la del comercial entera y
  // las pantallas del área. Al pegarlas hay que renombrar «Mi día» del área,
  // que si no aparece dos veces con el mismo nombre y nadie sabe cuál es cuál.
  const enlaces = esSoporte
    ? [
        ...ENLACES_POR_ROL[rol],
        ...ENLACES_POSTVENTA.filter((e) => e.href.startsWith("/postventa") || e.href === "/comercial/ruta").map((e) =>
          e.href === "/postventa" ? { ...e, etiqueta: "Postventa" } : e,
        ),
      ]
    : esPostventa
    ? ENLACES_POSTVENTA
    : hacePostventa
      ? [...ENLACES_POR_ROL[rol], ENLACE_RUTA]
      : ENLACES_POR_ROL[rol];

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
          <div key={enlace.href} className="contents">
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
            <Icono className="size-4 shrink-0" />
            {!plegada && enlace.etiqueta}
          </Link>
          </div>
        );
      })}
    </nav>
  );
}
