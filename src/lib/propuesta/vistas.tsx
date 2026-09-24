import type { ComponentType } from "react";
import type { createClient } from "@/lib/supabase/server";
import type { Perfil } from "@/types/database";

/**
 * LAS VISTAS NUEVAS DE LA PROPUESTA (v2, 23-09). Una pestaña de una sección
 * puede mostrar una pantalla de siempre (paginas.tsx) o una vista rediseñada
 * con el kit (components/propuesta/kit.tsx). Se piden en menu.ts con
 * `pagina: "vista:<clave>"`.
 *
 * Cada vista puede exportar además `conteo`, el número que va en su
 * pestaña, y `alerta` si ese número significa que alguien espera.
 */
type Cliente = Awaited<ReturnType<typeof createClient>>;
export type PropsVista = { perfil: Perfil; searchParams: Record<string, string | undefined>; base: string };
export interface ModuloVista {
  default: ComponentType<PropsVista>;
  conteo?: (supabase: Cliente, perfil: Perfil) => Promise<number>;
  alerta?: boolean;
}

export const VISTAS: Record<string, () => Promise<ModuloVista>> = {
  // Central y Finanzas
  "central-pedidos": () => import("@/components/propuesta/vistas/central-pedidos"),
  "finanzas-por-confirmar": () => import("@/components/propuesta/vistas/finanzas-por-confirmar"),
  "finanzas-por-liquidar": () => import("@/components/propuesta/vistas/finanzas-por-liquidar"),
  // Almacén y postventa
  "almacen-series": () => import("@/components/propuesta/vistas/almacen-series"),
  "almacen-pedidos": () => import("@/components/propuesta/vistas/almacen-pedidos"),
  "postventa-esperando": () => import("@/components/propuesta/vistas/postventa-esperando"),
};
