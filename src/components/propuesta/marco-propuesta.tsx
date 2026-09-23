import Link from "next/link";
import { Eye, LogOut, Plus, Search } from "lucide-react";
import { BarraPropuesta } from "@/components/propuesta/barra-propuesta";
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

/**
 * EL MARCO DE LA PROPUESTA DE NAVEGACIÓN. Envuelve cualquier pantalla del CRM
 * cuando entra una cuenta de demostración con la vista nueva: la barra corta,
 * «Buscar» y «Nuevo» arriba, y una franja que dice qué se está mirando.
 */
export function MarcoPropuesta({ perfil, children }: { perfil: Perfil; children: React.ReactNode }) {
  const tipo = tipoDePerfil(perfil);
  const buscar = BUSCAR_EN[tipo];
  return (
    <div className="flex min-h-screen flex-1">
      <BarraPropuesta opciones={MENU[tipo]} perfil={NOMBRE_PERFIL[tipo]} verComo={tipo === "operaciones" ? VER_COMO : undefined} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1B1A1D] px-6 py-2 text-xs text-white">
          <span>
            <b className="font-bold uppercase tracking-widest text-[#F0A29C]">Propuesta</b>
            <span className="ml-2 opacity-90">
              Viendo el CRM como <b>{perfil.nombre}</b> · solo lectura, nada se guarda
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Link href="/demo/vista?v=actual" className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 font-semibold hover:bg-white/20">
              <Eye className="size-3.5" />
              Ver cómo es hoy
            </Link>
            <Link href="/demo/salir" className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 hover:bg-white/10">
              <LogOut className="size-3.5" />
              Salir
            </Link>
          </span>
        </div>
        <header className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-6 py-3">
          <form action={buscar.href} method="get" className="flex min-w-64 flex-1 items-center gap-2 rounded-lg border border-input bg-muted/40 px-3 py-2 focus-within:border-ring focus-within:bg-background">
            <Search className="size-4 text-muted-foreground" />
            <input
              id="buscar-global"
              name="q"
              placeholder={`Buscar: ${buscar.ayuda}`}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="off"
            />
          </form>
          <button
            type="button"
            disabled
            title="En la demostración no se crea nada"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground opacity-60"
          >
            <Plus className="size-4" />
            {NUEVO[tipo]}
          </button>
          <div className="ml-auto text-right">
            <p className="text-sm font-medium text-foreground">{perfil.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {NOMBRE_PERFIL[tipo]}
              {perfil.codigo_comercial ? ` · ${perfil.codigo_comercial}` : ""}
            </p>
          </div>
        </header>
        <main className="flex-1 bg-app-bg p-6">{children}</main>
      </div>
    </div>
  );
}
