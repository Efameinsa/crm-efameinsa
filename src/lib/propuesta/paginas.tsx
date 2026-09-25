import type { ComponentType } from "react";

/**
 * Las pantallas actuales que la propuesta reordena (ver menu.ts). Se cargan
 * solo cuando se abre la pestaña. Todas reciben `searchParams` como promesa,
 * igual que en su ruta de siempre.
 */
type Pagina = ComponentType<{ searchParams: Promise<Record<string, string | undefined>> }>;
type Carga = () => Promise<{ default: unknown }>;

const PAGINAS: Record<string, Carga> = {
  "central": () => import("@/app/(app)/central/page"),
  "central/clientes": () => import("@/app/(app)/central/clientes/page"),
  "central/presupuestos": () => import("@/app/(app)/central/presupuestos/page"),
  "central/cierres": () => import("@/app/(app)/central/cierres/page"),
  "central/pedidos": () => import("@/app/(app)/central/pedidos/page"),
  "central/derivados": () => import("@/app/(app)/central/derivados/page"),
  "comercial": () => import("@/app/(app)/comercial/page"),
  "comercial/oportunidades": () => import("@/app/(app)/comercial/oportunidades/page"),
  "comercial/potenciales": () => import("@/app/(app)/comercial/potenciales/page"),
  "comercial/cotizaciones": () => import("@/app/(app)/comercial/cotizaciones/page"),
  "comercial/cierres": () => import("@/app/(app)/comercial/cierres/page"),
  "comercial/cartera": () => import("@/app/(app)/comercial/cartera/page"),
  "comercial/parque": () => import("@/app/(app)/comercial/parque/page"),
  "comercial/agenda": () => import("@/app/(app)/comercial/agenda/page"),
  "comercial/visitas": () => import("@/app/(app)/comercial/visitas/page"),
  "comercial/ruta": () => import("@/app/(app)/comercial/ruta/page"),
  "comercial/mi-gestion": () => import("@/app/(app)/comercial/mi-gestion/page"),
  "postventa": () => import("@/app/(app)/postventa/page"),
  "postventa/atenciones": () => import("@/app/(app)/postventa/atenciones/page"),
  "postventa/macro": () => import("@/app/(app)/postventa/macro/page"),
  "postventa/equipos": () => import("@/app/(app)/postventa/equipos/page"),
  "postventa/agenda": () => import("@/app/(app)/postventa/agenda/page"),
  "postventa/visitas": () => import("@/app/(app)/postventa/visitas/page"),
  "postventa/control": () => import("@/app/(app)/postventa/control/page"),
  "almacen": () => import("@/app/(app)/almacen/page"),
  "almacen/pedidos": () => import("@/app/(app)/almacen/pedidos/page"),
  "operaciones/catalogo": () => import("@/app/(app)/operaciones/catalogo/page"),
  "admin/productos": () => import("@/app/(app)/admin/productos/page"),
  "postventa/aperturas": () => import("@/app/(app)/postventa/aperturas/page"),
  "almacen/informes": () => import("@/app/(app)/almacen/informes/page"),
  "almacen/aperturas": () => import("@/app/(app)/almacen/aperturas/page"),
  "finanzas/liquidar": () => import("@/app/(app)/finanzas/liquidar/page"),
  "central/informe": () => import("@/app/(app)/central/informe/page"),
  "finanzas/confirmados": () => import("@/app/(app)/finanzas/confirmados/page"),
  "almacen/aperturas-postventa": () => import("@/app/(app)/almacen/aperturas-postventa/page"),
  "almacen/agenda": () => import("@/app/(app)/almacen/agenda/page"),
  "almacen/atenciones": () => import("@/app/(app)/almacen/atenciones/page"),
  "almacen/visitas": () => import("@/app/(app)/almacen/visitas/page"),
  "operaciones": () => import("@/app/(app)/operaciones/page"),
  "operaciones/permisos": () => import("@/app/(app)/operaciones/permisos/page"),
  "admin/catalogos": () => import("@/app/(app)/admin/catalogos/page"),
  "gerencia/panel": () => import("@/app/(app)/gerencia/page"),
  "gerencia/supervision": () => import("@/app/(app)/gerencia/supervision/page"),
  "gerencia/gestion-whatsapp": () => import("@/app/(app)/gerencia/gestion-whatsapp/page"),
  "gerencia/potenciales": () => import("@/app/(app)/gerencia/potenciales/page"),
  "gerencia/marketing": () => import("@/app/(app)/gerencia/marketing/page"),
  "gerencia/finanzas": () => import("@/app/(app)/gerencia/finanzas/page"),
  "gerencia/marketing/whatsapp": () => import("@/app/(app)/gerencia/marketing/whatsapp/page"),
  "gerencia/clientes": () => import("@/app/(app)/gerencia/clientes/page"),
  "gerencia/cartera-liberable": () => import("@/app/(app)/gerencia/cartera-liberable/page"),
  "gerencia/reportes": () => import("@/app/(app)/gerencia/reportes/page"),
  "gerencia/accesos": () => import("@/app/(app)/gerencia/accesos/page"),
  "gerencia/auditoria": () => import("@/app/(app)/gerencia/auditoria/page"),
  "finanzas": () => import("@/app/(app)/finanzas/page"),
  "finanzas/cobrar": () => import("@/app/(app)/finanzas/cobrar/page"),
  "finanzas/aperturas": () => import("@/app/(app)/finanzas/aperturas/page"),
  "facturacion": () => import("@/app/(app)/facturacion/page"),
  "facturacion/facturados": () => import("@/app/(app)/facturacion/facturados/page"),
};

/** Dibuja una pantalla existente con los parámetros de la URL más los fijos de la pestaña. */
export async function PantallaExistente({
  clave,
  searchParams,
  fijos,
}: {
  clave: string;
  searchParams: Promise<Record<string, string | undefined>>;
  fijos?: Record<string, string>;
}) {
  const carga = PAGINAS[clave];
  if (!carga) return <p className="text-sm text-muted-foreground">Esta pantalla todavía no está en la propuesta.</p>;
  const Componente = (await carga()).default as Pagina;
  const parametros = fijos ? searchParams.then((sp) => ({ ...sp, ...fijos })) : searchParams;
  return <Componente searchParams={parametros} />;
}
