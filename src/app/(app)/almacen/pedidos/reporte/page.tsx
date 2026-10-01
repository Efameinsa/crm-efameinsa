import { requerirPerfil } from "@/lib/auth";
import { ReporteAlmacenHoja } from "@/components/crm/reporte-almacen-hoja";

export const dynamic = "force-dynamic";

/**
 * El reporte del almacén, para imprimir o guardar como PDF (Lesly, 01-10):
 * códigos dados, pendientes de código, por probar, despachos y otras actividades.
 */
export default async function ReporteAlmacenPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  await requerirPerfil();
  const sp = await searchParams;
  return <ReporteAlmacenHoja desde={sp.desde} hasta={sp.hasta} />;
}
