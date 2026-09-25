import { cookies } from "next/headers";
import { Bell, Moon, Plus, Search, Sparkles, Sun } from "lucide-react";
import "@/app/propuesta.css";
import { BarraPropuesta } from "@/components/propuesta/barra-propuesta";
import { BarraProgreso } from "@/components/propuesta/barra-progreso";
import { GuardaDemo } from "@/components/propuesta/guarda-demo";
import { PasarContactoCentral } from "@/components/crm/pasar-contacto-central";
import { campaniasWhatsappActivas } from "@/lib/acciones/whatsapp-campanas";
import { SelectorFechaHora } from "@/components/propuesta/selector-fecha-hora";
import { TemaEnElCuerpo } from "@/components/propuesta/tema-en-el-cuerpo";
import Link from "next/link";
import { cn } from "@/lib/utils";

// La letra de la marca (Archivo) va alojada en public/fonts y declarada en
// propuesta.css: next/font/google no compila con Turbopack en esta versión.
export const COOKIE_TEMA = "crm-tema";
import { BUSCAR_EN, MENU, NOMBRE_PERFIL, VER_COMO, tipoDePerfil } from "@/lib/propuesta/menu";
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
export async function MarcoPropuesta({ perfil, children }: { perfil: Perfil; children: React.ReactNode }) {
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
  return (
    <div className={cn("propuesta flex min-h-screen flex-1 bg-app-bg", oscuro && "dark")} data-tema={oscuro ? "oscuro" : "claro"}>
      <BarraProgreso />
      <GuardaDemo />
      <SelectorFechaHora />
      <TemaEnElCuerpo oscuro={oscuro} />
      <BarraPropuesta opciones={MENU[tipo]} perfil={NOMBRE_PERFIL[tipo]} verComo={tipo === "operaciones" ? VER_COMO : undefined} pin={tipo === "gerencia" || tipo === "admin" || tipo === "operaciones"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border/70 bg-card/80 px-6 py-2.5 backdrop-blur-md">
          <form action={buscar.href} method="get" className="flex min-w-64 max-w-xl flex-1 items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 py-1.5 transition-all duration-200 focus-within:border-[var(--c-celeste)] focus-within:bg-card focus-within:ring-4 focus-within:ring-[var(--c-celeste)]/15">
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
              {NUEVO[tipo].etiqueta}
            </Link>
          )}
          {pasaContactos && (
            <span className="pasar-a-central">
              <PasarContactoCentral contexto={tipo === "postventa" ? "postventa" : tipo === "almacen" ? "almacen" : "comercial"} campaniasWhatsapp={campanias} />
            </span>
          )}
          <span className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground" title="Avisos">
            <Bell className="size-4" />
          </span>
          <a
            href={`/demo/vista?tema=${oscuro ? "claro" : "oscuro"}`}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-[var(--c-naranja)] hover:text-[var(--c-naranja)]"
            title={oscuro ? "Ver en claro" : "Ver en oscuro"}
          >
            {oscuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </a>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1 rounded-full bg-[var(--c-verde)]/12 px-2.5 py-1 text-[11px] font-semibold text-[var(--verde-texto)] lg:inline-flex" title="Vista de la propuesta: se mira, no se guarda">
              <Sparkles className="size-3" /> Propuesta · solo lectura
            </span>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--c-celeste)] to-[var(--c-verde)] text-[11px] font-bold text-white ring-2 ring-card">
                {iniciales(perfil.nombre)}
              </span>
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-[13px] font-semibold text-foreground">{perfil.nombre.replace(/^Propuesta · /, "")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {NOMBRE_PERFIL[tipo]}
                  {perfil.codigo_comercial ? ` · ${perfil.codigo_comercial}` : ""}
                </p>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
