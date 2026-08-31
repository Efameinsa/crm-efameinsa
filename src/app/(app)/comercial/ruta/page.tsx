import { requerirPerfil } from "@/lib/auth";
import { RutaMantenimientoVista } from "@/components/crm/ruta-mantenimiento-vista";

export const dynamic = "force-dynamic";

/**
 * La ruta de mantenimiento, como URL propia.
 *
 * El plan 23, etapa 4, la puso también como pestaña de
 * `/comercial/oportunidades` («la ruta es una campaña sobre el mismo
 * pipeline, no otro objeto») y sacó su entrada del menú de postventa — pero
 * esta URL sigue funcionando: Ariana, que vende mantenimiento como
 * comercial (`hace_postventa`) y no tiene nada que ver en `/postventa`, la
 * sigue usando directo desde `ENLACE_RUTA`. Toda la lógica vive en
 * `RutaMantenimientoVista` (regla del repo: no copiar).
 */
export default async function RutaMantenimientoPage({
  searchParams,
}: {
  searchParams: Promise<{
    ver?: string;
    q?: string;
    todos?: string;
    mant?: string;
    compra?: string;
    llamada?: string;
  }>;
}) {
  const [perfil, sp] = await Promise.all([requerirPerfil(), searchParams]);
  return <RutaMantenimientoVista perfil={perfil} sp={sp} hrefBase="/comercial/ruta" />;
}
