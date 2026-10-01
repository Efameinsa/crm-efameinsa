import { requerirPerfil } from "@/lib/auth";
import { ReportePendientesHoja } from "@/components/crm/reporte-pendientes-hoja";

export const dynamic = "force-dynamic";

/** El reporte de pendientes del almacén, para imprimir o guardar como PDF (Lesly, 01-10). */
export default async function ReportePendientesAlmacenPage() {
  await requerirPerfil();
  return <ReportePendientesHoja deAlmacen volver={{ href: "/almacen", texto: "Volver a Almacén" }} />;
}
