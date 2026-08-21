import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prellenarInforme } from "@/lib/acciones/informes";
import { FormularioInforme } from "@/components/crm/formulario-informe";
import { SeccionPanel } from "@/components/crm/seccion-panel";

// Informe de cierre de ventas hacia Central. Se llega desde la ficha del
// cliente, que es donde el comercial está cuando acaba de cerrar la venta.
export default async function NuevoInformePage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string; venta?: string }>;
}) {
  const { cuenta, venta } = await searchParams;
  if (!cuenta) notFound();

  // El prellenado va con la sesión del usuario, así que RLS ya decide si esa
  // cuenta es de su cartera: si no lo es, no hay datos y la página no existe.
  const { error, datos } = await prellenarInforme(cuenta);
  if (error || !datos) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Link
        href={`/comercial/cartera/${cuenta}`}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" /> Volver a {datos.cuenta.razon_social}
      </Link>

      <SeccionPanel titulo="Informe de cierre de ventas">
        <p className="mb-4 text-sm text-muted-foreground">
          El documento que recibe Central para facturar, cobrar y despachar.
        </p>
        <FormularioInforme prellenado={datos} ventaPreseleccionada={venta} />
      </SeccionPanel>
    </div>
  );
}
