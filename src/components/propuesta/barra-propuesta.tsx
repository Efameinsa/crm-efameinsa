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

function activa(opcion: OpcionMenu, ruta: string): boolean {
  if (opcion.href === "/nuevo") return ruta === "/nuevo";
  const base = opcion.href.split("?")[0];
  return [base, ...opcion.coincide].some((c) => ruta === c || ruta.startsWith(c + "/"));
}

/**
 * LA BARRA LATERAL DE LA PROPUESTA (v2, 24-09; referencias de Santos: CRM
 * modernos claros, con la barra blanca). Una sola lista corta con «Hoy»
 * primero; la opción activa va en una píldora granate suave, con el icono en
 * granate. Abajo, cómo volver a la vista de siempre y cómo salir.
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
    <aside className="flex w-[15.5rem] flex-none flex-col border-r border-border bg-card">
      <div className="px-5 pb-3 pt-5">
        <Image src="/logo-efameinsa-transparente.png" alt="Efameinsa" width={2345} height={381} className="h-7 w-auto dark:brightness-0 dark:invert" priority />
        <span className="mt-3 inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
          {perfil}
        </span>
      </div>
      <nav className="flex flex-col gap-1 px-3 pt-2" aria-label="Menú">
        {opciones.map((o) => {
          const Icono = ICONOS[o.icono];
          const es = activa(o, ruta);
          return (
            <Link
              key={o.href + o.etiqueta}
              href={o.href}
              aria-current={es ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors duration-150",
                es ? "bg-primary/10 font-semibold text-primary" : "text-foreground/75 hover:bg-accent hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                  es ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/60 group-hover:bg-card group-hover:text-foreground",
                )}
              >
                <Icono className="size-4" />
              </span>
              {o.etiqueta}
            </Link>
          );
        })}
      </nav>
      {verComo && verComo.length > 0 && (
        <div className="mt-3 border-t border-border px-3 pt-3">
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ver como</p>
          {verComo.map((v) => (
            <Link
              key={v.href}
              href={v.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-foreground/70 hover:bg-accent",
                ruta.startsWith(v.href) && "bg-accent text-foreground",
              )}
            >
              <Package className="size-4" />
              {v.etiqueta}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-auto space-y-1 border-t border-border p-3">
        <Link href="/demo/vista?v=actual" className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-foreground/70 hover:bg-accent hover:text-foreground">
          <Eye className="size-4" /> Ver cómo es hoy
        </Link>
        <Link href="/demo/salir" className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-foreground/70 hover:bg-accent hover:text-foreground">
          <LogOut className="size-4" /> Salir de la propuesta
        </Link>
      </div>
    </aside>
  );
}
