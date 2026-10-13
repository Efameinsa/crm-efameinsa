import { LoQueFaltaPorPaso } from "@/components/crm/lo-que-falta-por-paso";

export const dynamic = "force-dynamic";

/** La agenda de postventa: lo que falta, paso por paso, solo lo abierto (reunión 13-10). */
export default async function PendientesPorPasoPage() {
  return <LoQueFaltaPorPaso />;
}
