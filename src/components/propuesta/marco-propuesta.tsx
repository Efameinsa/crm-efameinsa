import { cookies } from "next/headers";
import { Bell, LogOut, Moon, Plus, Search, Sparkles, Sun } from "lucide-react";
import "@/app/propuesta.css";
import { BarraPropuesta } from "@/components/propuesta/barra-propuesta";
import { MenuMovil } from "@/components/propuesta/menu-movil";
import { BarraProgreso } from "@/components/propuesta/barra-progreso";
import { GuardaDemo } from "@/components/propuesta/guarda-demo";
import { PasarContactoCentral } from "@/components/crm/pasar-contacto-central";
import { campaniasWhatsappActivas } from "@/lib/acciones/whatsapp-campanas";
import { SelectorFechaHora } from "@/components/propuesta/selector-fecha-hora";
import { TemaEnElCuerpo } from "@/components/propuesta/tema-en-el-cuerpo";
import Link from "@/components/enlace";
import { cn } from "@/lib/utils";
import { CampanaNotificaciones } from "@/components/crm/campana-notificaciones";
import { CambiarClave } from "@/components/crm/cambiar-clave";
import { cerrarSesion } from "@/lib/acciones/auth";
import { createClient } from "@/lib/supabase/server";
import { contarAtencionesAbiertas, contarBandejaMiDia } from "@/lib/contadores-postventa";

// La letra de la marca (Archivo) va alojada en public/fonts y declarada en
// propuesta.css: next/font/google no compila con Turbopack en esta versión.
export const COOKIE_TEMA = "crm-tema";
import { BUSCAR_EN, MENU, NOMBRE_PERFIL, tipoDePerfil } from "@/lib/propuesta/menu";
import type { Perfil } from "@/types/database";

/**
 * Lo que cada perfil crea desde el botón de la cabecera, y adónde lleva
 * (24-09: estaba apagado; Santos, en central_test, «no encuentro la manera de
 * registrar un contacto»). Abre el formulario de siempre dentro de la
 * propuesta; al enviarlo, GuardaDemo avisa que acá no se guarda.
 */
const NUEVO: Record<string, { etiqueta: string; href: string }> = {
  central: { etiqueta: "Registrar contacto", href: "/central/captura" },
  comercial: { etiqueta: "Cotizar", href: "/nuevo/oportunidades" },
  postventa: { etiqueta: "Registrar caso", href: "/postventa/casos/nuevo" },
  preventivo: { etiqueta: "Cotizar", href: "/nuevo/oportunidades" },
  almacen: { etiqueta: "Nuevo informe técnico", href: "/almacen/informes" },
  finanzas: { etiqueta: "Confirmar abono", href: "/nuevo/pagos" },
  facturacion: { etiqueta: "Registrar factura", href: "/facturacion" },
  operaciones: { etiqueta: "Nuevo equipo", href: "/operaciones/catalogo" },
  admin: { etiqueta: "Nuevo usuario", href: "/admin" },
};

const iniciales = (n: string) =>
  n
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/**
 * EL MARCO DE LA PROPUESTA DE NAVEGACIÓN (v2, 24-09). Envuelve cualquier
 * pantalla cuando entra una cuenta de demostración con la vista nueva: la
 * barra clara a la izquierda; arriba «Buscar», «Nuevo», la campana y quién
 * está mirando; y una píldora que recuerda que es la propuesta, en solo lectura.
 */
export async function MarcoPropuesta({
  perfil,
  demo = true,
  arriba = null,
  alPie = null,
  children,
}: {
  perfil: Perfil;
  /** Cuenta _test (espejo, solo lectura) o cuenta real con la vista nueva (25-09). */
  demo?: boolean;
  /** Franjas de auditoría y práctica, y los avisos de activar notificaciones, instalar y gestiones sin subir. */
  arriba?: React.ReactNode;
  /** Refresco en vivo, versión nueva, comunicado de gerencia y asistente. */
  alPie?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tipo = tipoDePerfil(perfil);
  const buscar = BUSCAR_EN[tipo];
  // Claro u oscuro, elegido desde la cabecera; la cookie la pone /demo/vista.
  const oscuro = (await cookies()).get(COOKIE_TEMA)?.value === "oscuro";
  // «PASAR CONTACTO A CENTRAL» (24-09). Santos: «¿de qué manera un comercial
  // puede derivar a central un contacto? No veo ese formulario». En el CRM de
  // siempre vive en la cabecera de «Mi día» (comercial) y del día de postventa,
  // pantallas que la propuesta reemplazó por «Hoy»: sin esto, el botón se
  // perdía. Queda en la cabecera, a la vista en cualquier sección.
  const pasaContactos = tipo === "comercial" || tipo === "preventivo" || tipo === "postventa" || tipo === "almacen";
  const campanias = pasaContactos ? await campaniasWhatsappActivas() : [];
  // LOS NÚMEROS DEL MENÚ (auditoría 25-09): los mismos dos de la barra de
  // siempre para postventa —lo que llega al día y las atenciones abiertas—,
  // con las mismas consultas livianas. Solo para quien trabaja el área.
  const contadores: Record<string, number> = {};
  if (tipo === "postventa") {
    const supabase = await createClient();
    const [miDia, atenciones] = await Promise.all([contarBandejaMiDia(supabase, perfil.id), contarAtencionesAbiertas(supabase)]);
    contadores["/nuevo/atenciones"] = miDia + atenciones;
  }
  const propsBarra = {
    demo,
    contadores,
    opciones: MENU[tipo],
    perfil: NOMBRE_PERFIL[tipo],
    pin: tipo === "gerencia" || tipo === "admin" || tipo === "operaciones",
  };
  return (
    <div className={cn("propuesta flex min-h-screen flex-1 bg-app-bg", oscuro && "dark")} data-tema={oscuro ? "oscuro" : "claro"}>
      <BarraProgreso />
      {demo && <GuardaDemo />}
      <SelectorFechaHora />
      <TemaEnElCuerpo oscuro={oscuro} />
      <BarraPropuesta {...propsBarra} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* RESPONSIVE (26-09): en el teléfono el menú se abre con ☰ (y la barra
            de abajo), el buscador baja a su propia fila y los botones quedan en
            ícono. En 1280×720 (las laptops de la oficina) se ve como siempre. */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border/70 bg-card/80 px-3 py-2 backdrop-blur-md sm:gap-3 sm:px-4 lg:px-6 lg:py-2.5">
          <MenuMovil {...propsBarra} />
          <form action={buscar.href} method="get" className="order-last flex min-w-0 basis-full items-center gap-2 sm:order-none sm:min-w-64 sm:max-w-xl sm:flex-1 sm:basis-auto rounded-lg border border-border bg-secondary/60 px-3 py-1.5 transition-all duration-200 focus-within:border-[var(--c-marca)] focus-within:bg-card focus-within:ring-4 focus-within:ring-[var(--c-marca)]/15">
            <Search className="size-4 text-muted-foreground" />
            <input
              id="buscar-global"
              name="q"
              placeholder={`Buscar: ${buscar.ayuda}`}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="off"
            />
            <kbd className="hidden whitespace-nowrap rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:block">Ctrl K</kbd>
          </form>
          {NUEVO[tipo] && (
            <Link
              href={NUEVO[tipo].href}
              className="group inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-md"
            >
              <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" />
              <span className="max-[380px]:hidden">{NUEVO[tipo].etiqueta}</span>
            </Link>
          )}
          {pasaContactos && (
            <span className="pasar-a-central">
              <PasarContactoCentral contexto={tipo === "postventa" ? "postventa" : tipo === "almacen" ? "almacen" : "comercial"} campaniasWhatsapp={campanias} />
            </span>
          )}
          {/* LA CAMPANA DE VERDAD (25-09): la lista de avisos, cada uno lleva a su
              pantalla, y la ventana emergente con sonido cuando llega uno. En la
              cuenta _test queda de adorno: lee con la sesión propia, no la del espejo. */}
          {demo ? (
            <span className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground" title="En la cuenta real aquí llegan los avisos">
              <Bell className="size-4" />
            </span>
          ) : (
            <span className="campana-propuesta">
              <CampanaNotificaciones userId={perfil.id} rol={perfil.rol} />
            </span>
          )}
          <a
            href={`/demo/vista?tema=${oscuro ? "claro" : "oscuro"}`}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-[var(--c-naranja)] hover:text-[var(--c-naranja)]"
            title={oscuro ? "Ver en claro" : "Ver en oscuro"}
          >
            {oscuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </a>
          <div className="ml-auto flex items-center gap-3">
            {demo ? (
              <span className="hidden items-center gap-1 rounded-full bg-[var(--c-verde)]/12 px-2.5 py-1 text-[11px] font-semibold text-[var(--verde-texto)] lg:inline-flex" title="Vista de la propuesta: se mira, no se guarda">
                <Sparkles className="size-3" /> Propuesta · solo lectura
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <CambiarClave />
                <form action={cerrarSesion}>
                  <button
                    type="submit"
                    title="Cerrar sesión"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <LogOut className="size-3.5" /> <span className="hidden sm:inline">Salir</span>
                  </button>
                </form>
              </span>
            )}
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--marca-alto)_0%,var(--c-marca)_45%,var(--c-carbon)_100%)] shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] text-[11px] font-bold text-white ring-2 ring-card">
                {iniciales(perfil.nombre)}
              </span>
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-[13px] font-semibold text-foreground">{perfil.nombre.replace(/^Propuesta · /, "")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {tipo === "operaciones" ? "Administración de operaciones" : NOMBRE_PERFIL[tipo]}
                  {perfil.codigo_comercial ? ` · ${perfil.codigo_comercial}` : ""}
                </p>
              </div>
            </div>
          </div>
        </header>
        {arriba}
        <main className="min-w-0 flex-1 p-3 pb-24 sm:p-4 md:pb-6 lg:p-6">{children}</main>
        {alPie}
      </div>
    </div>
  );
}
