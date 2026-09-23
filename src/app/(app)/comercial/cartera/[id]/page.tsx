import { redirect } from "next/navigation";
import { FichaCuenta } from "@/components/crm/ficha-cuenta";
import { enVistaNueva } from "@/lib/propuesta/vista";

export default async function CuentaDetallePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ hoy?: string }> }) {
  const { id } = await params;
  // Propuesta: en la vista nueva, el cliente se abre en su Ficha 360 («Ficha de hoy» vuelve acá con ?hoy=1).
  if (!(await searchParams).hoy && (await enVistaNueva())) redirect(`/nuevo/cliente/${id}`);
  return <FichaCuenta cuentaId={id} />;
}
