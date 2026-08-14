import { FichaCuenta } from "@/components/crm/ficha-cuenta";

export default async function ClienteGerenciaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FichaCuenta cuentaId={id} comoGerencia />;
}
