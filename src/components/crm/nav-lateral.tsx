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
  Boxes,
  Gauge,
  CalendarDays,
  ClipboardCheck,
  PiggyBank,
  PackageCheck,
  Send,
  Wrench,
  Target,
  Route,
  ShieldCheck,
  KeyRound,
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
    // Los cierres, al lado de las cotizaciones: son los dos documentos que
    // produce el comercial y hasta el 28-08 solo uno se podía volver a mirar
    // (el informe se abría una vez, al emitirlo, y después había que buscarlo
    // dentro de la ficha del cliente o pedírselo a Central).
    { href: "/comercial/cierres", etiqueta: "Mis cierres", icono: PackageCheck },
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
  // OPERACIONES (0115). Su día no es vender: es autorizar lo que los demás
  // no pueden corregir solos, repartir los permisos que se dan y se quitan,
  // y mantener el maestro del que salen los precios. Tres cosas, tres
  // enlaces — y ninguno dice «mis», porque nada de esto es de ella: es de la
  // empresa y ella lo administra.
  operaciones: [
    { href: "/operaciones", etiqueta: "Autorizaciones", icono: KeyRound },
    { href: "/operaciones/permisos", etiqueta: "Permisos", icono: ShieldCheck },
    { href: "/operaciones/catalogo", etiqueta: "El catálogo", icono: Package },
    { href: "/admin/catalogos", etiqueta: "Listas del sistema", icono: BookMarked },
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
// Nombres que cambiaron por el mismo motivo: le mintieron a Carlos mientras
// miraba la pantalla. «Agenda de despachos» → **Calendario** (27-08, al
// pedir verlo por semana). «Soporte técnico» → «Casos» → **Atenciones**
// (31-08, plan 23): «Casos», la «Lista» del calendario y el historial de
// informes eran cuatro puertas al mismo trabajo técnico — se unifican en una
// sola entrada, sin migrar una fila. «Mis casos» → **Mis ventas de
// servicio**: preguntó textual «¿qué viene a ser mis casos?», y son sus
// oportunidades de mantenimiento y repuestos, no los casos técnicos.
//
// «Mi agenda» salió del menú del área el 31-08 (plan 23, etapa 2): el
// calendario y Atenciones ya cubren sus dos razones de ser —agendar y ver el
// reporte del día/cierre semanal, que ahora viven en «Mi día»—; seguía
// abierta solo para Ariana y los demás comerciales que además venden
// mantenimiento, que sí la conservan como comercial (`ENLACE_RUTA` más
// abajo no la incluye porque ya la tienen en `ENLACES_POR_ROL.comercial`).
const ENLACES_POSTVENTA = [
  { href: "/postventa", etiqueta: "Mi día", icono: Wrench },
  { href: "/postventa/agenda", etiqueta: "Calendario", icono: CalendarDays },
  // La pista técnica (0131) más los casos, despachos e histórico que hasta el
  // 31-08 vivían repartidos en cuatro pantallas (plan 23).
  { href: "/postventa/atenciones", etiqueta: "Atenciones", icono: Wrench },
  { href: "/postventa/equipos", etiqueta: "Equipos instalados", icono: Package },
  // La ruta de mantenimiento vive acá adentro como pestaña (plan 23, etapa
  // 4): «es una campaña sobre el mismo pipeline, no otro objeto». Ya no
  // tiene entrada propia en este menú.
  { href: "/comercial/oportunidades", etiqueta: "Ventas de servicio", icono: KanbanSquare },
  { href: "/comercial/cartera", etiqueta: "Clientes", icono: Building2 },
];

// Lo único que un comercial que además vende mantenimiento (`hace_postventa`,
// 0093) ve de más: su campaña. No es una pantalla del área —no ejecuta nada—,
// es su pipeline mirado como campaña de llamadas.
const ENLACE_RUTA = { href: "/comercial/ruta", etiqueta: "Ruta de mantenimiento", icono: Route };

// La pantalla del administrador de operaciones (0114): el código que dicta y
// lo que se hizo con él.
const ENLACE_OPERACIONES = { href: "/operaciones", etiqueta: "Autorizaciones", icono: KeyRound };

export function NavLateral({
  rol,
  esPostventa = false,
  hacePostventa = false,
  esSoporte = false,
  esOperaciones = false,
  plegada = false,
  contadorMiDia,
  contadorAtenciones,
}: {
  rol: RolUsuario;
  esPostventa?: boolean;
  /** Las dos colas del área (plan 23, etapa 5): «el número es el llamado a la acción». */
  contadorMiDia?: number;
  contadorAtenciones?: number;
  /**
   * Acompaña a los usuarios (0101): ve las dos barras porque su trabajo es que
   * los demás sepan usarlas.
   */
  esSoporte?: boolean;
  /**
   * Administrador de operaciones (0114): su trabajo es autorizar, así que su
   * menú abre por ahí y no por ocho pantallas que no son suyas.
   */
  esOperaciones?: boolean;
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
  // POR QUÉ ESTA CUENTA VA POR SECCIONES Y LAS DEMÁS NO.
  //
  // Lesly no tiene cartera, ni oportunidades, ni cotizaciones, ni cierres: su
  // perfil no tiene código comercial. Y sin embargo su menú abría con ocho
  // pantallas tituladas «Mi día», «Mis oportunidades», «Mi cartera»… que le
  // salían las ocho vacías. Están ahí a propósito desde la 0101 —tiene que ver
  // lo mismo que ve un comercial para poder acompañarlo—, así que no se quitan:
  // se agrupan y se dice qué son. Un menú de trece enlaces pegados, donde los
  // ocho primeros no son de uno y no lo aclara nada, no es un menú, es una
  // adivinanza.
  //
  // Y el orden cambia: primero lo que ella sí hace —autorizar y postventa—, y
  // al final lo que mira para ayudar a otros.
  // El enlace directo a la Ruta se agrega aparte (no sale de
  // ENLACES_POSTVENTA, que ya no lo tiene: plan 23, etapa 4) porque Lesly
  // —rol «operaciones», sin código comercial— es la única cuenta de esta
  // barra que no tiene cómo llegar a «Ventas de servicio» para encontrar la
  // pestaña Ruta ahí adentro: su rol no entra a la rama que muestra el menú
  // comercial completo. Sin este agregado se quedaría sin poder ver su
  // propia campaña de mantenimiento.
  const enlacesDelArea = [
    ...ENLACES_POSTVENTA.filter((e) => e.href.startsWith("/postventa")).map((e) =>
      e.href === "/postventa" ? { ...e, etiqueta: "Mi día en postventa" } : e,
    ),
    ENLACE_RUTA,
  ];

  const secciones: { titulo?: string; enlaces: typeof ENLACES_POSTVENTA }[] =
    rol === "operaciones"
      ? [
          { titulo: "Operaciones", enlaces: ENLACES_POR_ROL[rol] },
          { titulo: "Postventa", enlaces: enlacesDelArea },
        ]
      : esSoporte
    ? [
        ...(esOperaciones ? [{ titulo: "Operaciones", enlaces: [ENLACE_OPERACIONES] }] : []),
        { titulo: "Postventa", enlaces: enlacesDelArea },
        { titulo: "Como lo ve un comercial", enlaces: ENLACES_POR_ROL[rol] },
      ]
    : [
        {
          enlaces: esPostventa
            ? ENLACES_POSTVENTA
            : hacePostventa
              ? [...ENLACES_POR_ROL[rol], ENLACE_RUTA]
              : ENLACES_POR_ROL[rol],
        },
      ];
  const enlaces = secciones.flatMap((s) => s.enlaces);

  // El enlace activo es el de coincidencia más específica (más larga), no
  // solo el primero cuyo prefijo calce — así una ruta anidada como
  // /comercial/cartera/<id> resalta "Mi cartera" y no "Mi día".
  const activoHref = enlaces
    .filter((e) => pathname === e.href || pathname.startsWith(e.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {secciones.map((seccion, s) => (
        <div key={seccion.titulo ?? s} className="contents">
          {seccion.titulo && !plegada && (
            <p
              className={cn(
                "px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40",
                s > 0 && "pt-4",
              )}
            >
              {seccion.titulo}
            </p>
          )}
          {/* Plegada no hay dónde escribir el título: una línea separa igual. */}
          {seccion.titulo && plegada && s > 0 && <span className="my-2 h-px bg-sidebar-accent/60" />}
          {seccion.enlaces.map((enlace) => {
        const activo = enlace.href === activoHref;
        const Icono = enlace.icono;
        // Las dos colas del área, y solo esas dos: un número en cada entrada
        // del menú deja de significar «lo urgente» y vuelve a ser ruido.
        const contador =
          enlace.href === "/postventa"
            ? contadorMiDia
            : enlace.href === "/postventa/atenciones"
              ? contadorAtenciones
              : undefined;
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
            {!plegada && (
              <span className="flex flex-1 items-center justify-between gap-2">
                {enlace.etiqueta}
                {Boolean(contador) && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                      activo ? "bg-sidebar-primary-foreground/20" : "bg-sidebar-accent/70",
                    )}
                  >
                    {contador}
                  </span>
                )}
              </span>
            )}
          </Link>
          </div>
        );
          })}
        </div>
      ))}
    </nav>
  );
}
