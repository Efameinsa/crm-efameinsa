import { requerirPerfil } from "@/lib/auth";
import { ReportePendientesHoja } from "@/components/crm/reporte-pendientes-hoja";

export const dynamic = "force-dynamic";

/** El reporte de pendientes de pedidos, para imprimir o guardar como PDF (Lesly, 01-10). */
export default async function ReportePendientesPostventaPage() {
  await requerirPerfil();
  return <ReportePendientesHoja deAlmacen={false} volver={{ href: "/postventa/control", texto: "Volver a Control de pedidos" }} />;
}
