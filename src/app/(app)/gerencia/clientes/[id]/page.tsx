import { redirect } from "next/navigation";
import { FichaCuenta } from "@/components/crm/ficha-cuenta";
import { enVistaNueva } from "@/lib/propuesta/vista";

export default async function ClienteGerenciaDetallePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ hoy?: string }> }) {
  const { id } = await params;
  if (!(await searchParams).hoy && (await enVistaNueva())) redirect(`/nuevo/cliente/${id}`);
  return <FichaCuenta cuentaId={id} comoGerencia />;
}
