import { cookies } from "next/headers";
import { Bell, Moon, Plus, Search, Sparkles, Sun } from "lucide-react";
import "@/app/propuesta.css";
import { BarraPropuesta } from "@/components/propuesta/barra-propuesta";
import { cn } from "@/lib/utils";

// La letra de la marca (Archivo) va alojada en public/fonts y declarada en
// propuesta.css: next/font/google no compila con Turbopack en esta versión.
export const COOKIE_TEMA = "crm-tema";
import { BUSCAR_EN, MENU, NOMBRE_PERFIL, VER_COMO, tipoDePerfil } from "@/lib/propuesta/menu";
import type { Perfil } from "@/types/database";

/** Lo que cada perfil crea desde el botón «Nuevo» de la cabecera. */
const NUEVO: Record<string, string> = {
  central: "Registrar contacto",
  comercial: "Nueva cotización",
  postventa: "Registrar caso",
  preventivo: "Nueva cotización",
  almacen: "Nuevo informe técnico",
  finanzas: "Confirmar abono",
  operaciones: "Nuevo equipo",
  gerencia: "Nuevo comunicado",
  admin: "Nuevo usuario",
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
  return (
    <div className={cn("propuesta flex min-h-screen flex-1 bg-app-bg", oscuro && "dark")} data-tema={oscuro ? "oscuro" : "claro"}>
      <BarraPropuesta opciones={MENU[tipo]} perfil={NOMBRE_PERFIL[tipo]} verComo={tipo === "operaciones" ? VER_COMO : undefined} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border/70 bg-card/85 px-6 py-3 backdrop-blur">
          <form action={buscar.href} method="get" className="flex min-w-64 max-w-xl flex-1 items-center gap-2 rounded-xl border border-border bg-secondary/60 px-3 py-2 transition-colors focus-within:border-primary/40 focus-within:bg-card">
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
          <button
            type="button"
            disabled
            title="En la propuesta no se crea nada"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground opacity-70 shadow-sm"
          >
            <Plus className="size-4" />
            {NUEVO[tipo]}
          </button>
          <span className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground" title="Avisos">
            <Bell className="size-4" />
          </span>
          <a
            href={`/demo/vista?tema=${oscuro ? "claro" : "oscuro"}`}
            className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
            title={oscuro ? "Ver en claro" : "Ver en oscuro"}
          >
            {oscuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </a>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 lg:inline-flex dark:bg-amber-500/15 dark:text-amber-300" title="Vista de la propuesta: se mira, no se guarda">
              <Sparkles className="size-3" /> Propuesta · solo lectura
            </span>
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#8B1510] to-[#C0392B] text-xs font-bold text-white">
                {iniciales(perfil.nombre)}
              </span>
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-semibold text-foreground">{perfil.nombre.replace(/^Propuesta · /, "")}</p>
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
