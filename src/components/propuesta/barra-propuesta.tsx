"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BarChart3, Boxes, Building2, CalendarDays, CheckCircle2, ClipboardList, FileText, Gauge, HandCoins, Inbox,
  KanbanSquare, KeyRound, Landmark, Megaphone, MessageCircle, Package, ReceiptText, Route, ShieldCheck, Sun,
  Users, Wrench, BookMarked, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Icono, OpcionMenu } from "@/lib/propuesta/menu";

const ICONOS: Record<Icono, LucideIcon> = {
  hoy: Sun,
  conversaciones: MessageCircle,
  seguimiento: Inbox,
  pedidos: Package,
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

function activa(opcion: OpcionMenu, ruta: string): boolean {
  if (opcion.href === "/nuevo") return ruta === "/nuevo";
  const base = opcion.href.split("?")[0];
  return [base, ...opcion.coincide].some((c) => ruta === c || ruta.startsWith(c + "/"));
}

/**
 * La barra lateral de la propuesta: una sola lista corta, sin secciones, con
 * «Hoy» primero. El número al lado de cada opción no está: en la propuesta
 * el único número que llama a la acción vive en «Hoy».
 */
export function BarraPropuesta({
  opciones,
  perfil,
  verComo,
}: {
  opciones: OpcionMenu[];
  perfil: string;
  verComo?: { etiqueta: string; href: string }[];
}) {
  const ruta = usePathname();
  return (
    <aside className="flex w-60 flex-none flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col items-center gap-1 px-4 pb-4 pt-6">
        <Image src="/efameinsa-blanco.png" alt="Efameinsa" width={442} height={334} className="h-16 w-auto" priority />
        <span className="mt-2 rounded-full bg-sidebar-accent/60 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/70">
          {perfil}
        </span>
      </div>
      <nav className="flex flex-col gap-0.5 p-3" aria-label="Menú">
        {opciones.map((o) => {
          const Icono = ICONOS[o.icono];
          const es = activa(o, ruta);
          return (
            <Link
              key={o.href + o.etiqueta}
              href={o.href}
              aria-current={es ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] transition-colors duration-150",
                es
                  ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              {es && <span className="absolute -left-3 bottom-1.5 top-1.5 w-[3px] rounded-r bg-[var(--efameinsa-granate)]" />}
              <Icono className="size-[18px] shrink-0" />
              {o.etiqueta}
            </Link>
          );
        })}
      </nav>
      {verComo && verComo.length > 0 && (
        <div className="mt-2 border-t border-sidebar-accent/60 px-3 pt-4">
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/45">Ver como</p>
          {verComo.map((v) => (
            <Link
              key={v.href}
              href={v.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent",
                ruta.startsWith(v.href) && "bg-sidebar-accent text-sidebar-foreground",
              )}
            >
              <Package className="size-4" />
              {v.etiqueta}
            </Link>
          ))}
        </div>
      )}
    </aside>
  );
}
