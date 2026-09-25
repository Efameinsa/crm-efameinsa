"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BarChart3, Boxes, Building2, CalendarDays, CheckCircle2, ClipboardList, Eye, FileText, Gauge, HandCoins, Inbox,
  KanbanSquare, KeyRound, Landmark, LogOut, Megaphone, MessageCircle, Package, ReceiptText, Route, ShieldCheck, Sun,
  Users, Wrench, BookMarked, type LucideIcon,
  PhoneForwarded,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PinSupervisor } from "@/components/crm/pin-supervisor";
import type { Icono, OpcionMenu } from "@/lib/propuesta/menu";

const ICONOS: Record<Icono, LucideIcon> = {
  hoy: Sun,
  conversaciones: MessageCircle,
  seguimiento: Inbox,
  pedidos: Package,
  aperturas: PhoneForwarded,
  clientes: Building2,
  agenda: CalendarDays,
  oportunidades: KanbanSquare,
  ventas: FileText,
  numeros: Gauge,
  atenciones: Wrench,
  vender: HandCoins,
  campana: Route,
  informes: ClipboardList,
  cobranza: Landmark,
  abonos: ReceiptText,
  catalogo: Boxes,
  permisos: KeyRound,
  aprobaciones: CheckCircle2,
  marketing: Megaphone,
  operacion: BarChart3,
  control: ShieldCheck,
  usuarios: Users,
  listas: BookMarked,
};

/** El color de cada sección (v3, 24-09: celeste, verde, naranja). v4, 25-09: lo celeste pasa al granate claro de la casa. */
const TONO: Record<Icono, string> = {
  hoy: "var(--c-naranja)",
  conversaciones: "var(--c-verde)",
  seguimiento: "var(--c-marca-claro)",
  pedidos: "var(--c-naranja)",
  aperturas: "var(--c-verde)",
  clientes: "var(--c-marca-claro)",
  agenda: "var(--c-violeta)",
  oportunidades: "var(--c-verde)",
  ventas: "var(--c-marca-claro)",
  numeros: "var(--c-naranja)",
  atenciones: "var(--c-verde)",
  vender: "var(--c-marca-claro)",
  campana: "var(--c-naranja)",
  informes: "var(--c-verde)",
  cobranza: "var(--c-marca-claro)",
  abonos: "var(--c-verde)",
  catalogo: "var(--c-naranja)",
  permisos: "var(--c-violeta)",
  aprobaciones: "var(--c-verde)",
  marketing: "var(--c-naranja)",
  operacion: "var(--c-marca-claro)",
  control: "var(--c-verde)",
  usuarios: "var(--c-marca-claro)",
  listas: "var(--c-naranja)",
};

function activa(opcion: OpcionMenu, ruta: string): boolean {
  if (opcion.href === "/nuevo") return ruta === "/nuevo";
  const base = opcion.href.split("?")[0];
  return [base, ...opcion.coincide].some((c) => ruta === c || ruta.startsWith(c + "/"));
}

/**
 * LA BARRA LATERAL DE LA PROPUESTA (v3, 24-09). Una sola lista corta con
 * «Hoy» primero. Cada sección con su color; el icono va suelto, sin cajita
 * ni sombra (Santos: «los iconos del sidebar tienen un sombreado que no me
 * gusta»). La activa se tiñe de su color y lleva una rayita a la izquierda
 * (estilos en propuesta.css, `.nav-item`). Abajo, volver a la vista de
 * siempre y salir.
 */
export function BarraPropuesta({
  opciones,
  perfil,
  verComo,
  pin = false,
}: {
  opciones: OpcionMenu[];
  perfil: string;
  verComo?: { etiqueta: string; href: string }[];
  /** Gerencia, admin y operaciones: el PIN de autorización, como en la barra de siempre. */
  pin?: boolean;
}) {
  const ruta = usePathname();
  return (
    <aside className="barra-carbon sticky top-0 flex h-screen w-[14.5rem] flex-none flex-col">
      <div className="px-5 pb-3 pt-5">
        {/* El logo blanco de la oficial, grande (gerencia, 25-09: «el logo un poco más grande»). */}
        <span className="flex justify-center">
          <Image src="/efameinsa-blanco.png" alt="Efameinsa" width={442} height={334} className="h-16 w-auto" priority />
        </span>
        <span className="mt-3 flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/70">
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--c-verde)]" />
          {perfil}
        </span>
      </div>
      <nav className="flex flex-col gap-0.5 overflow-y-auto px-3 pt-2" aria-label="Menú">
        {opciones.map((o) => {
          const Icono = ICONOS[o.icono];
          const es = activa(o, ruta);
          return (
            <Link
              key={o.href + o.etiqueta}
              href={o.href}
              aria-current={es ? "page" : undefined}
              style={{ "--tono": TONO[o.icono] } as React.CSSProperties}
              className="nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px]"
            >
              <Icono className="size-[18px] shrink-0" strokeWidth={es ? 2.3 : 1.9} />
              {o.etiqueta}
            </Link>
          );
        })}
      </nav>
      {verComo && verComo.length > 0 && (
        <div className="mt-3 border-t border-sidebar-border px-3 pt-3">
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/50">Ver como</p>
          {verComo.map((v) => (
            <Link
              key={v.href}
              href={v.href}
              aria-current={ruta.startsWith(v.href) ? "true" : undefined}
              className="enlace-barra flex items-center gap-3 rounded-lg px-3 py-2 text-[13px]"
            >
              <Package className="size-4" />
              {v.etiqueta}
            </Link>
          ))}
        </div>
      )}
      {/* ENLACES CON EFECTO, SIN PRECARGA (24-09). Santos: «cada vez que quiero
          ver otras secciones se sale de la cuenta». Eran <Link>, y Next
          precarga los enlaces a la vista con un GET: /demo/salir cerraba la
          sesión y /demo/vista?v=actual cambiaba la vista sin que nadie
          tocara nada. Van como <a> a secas (Next no precarga anclas). */}
      {pin && (
        <div className="mt-auto pb-3 [&>div]:px-3">
          <PinSupervisor demo />
        </div>
      )}
      <div className={cn("space-y-1 border-t border-sidebar-border p-3", !pin && "mt-auto")}>
        <a href="/demo/vista?v=actual" className="enlace-barra flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors">
          <Eye className="size-4" /> Ver cómo es hoy
        </a>
        <a href="/demo/salir" className="enlace-barra flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors">
          <LogOut className="size-4" /> Salir de la propuesta
        </a>
      </div>
    </aside>
  );
}
