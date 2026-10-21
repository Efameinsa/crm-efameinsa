import { requerirPerfil } from "@/lib/auth";
import { CasosCentralBandeja } from "@/components/crm/casos-central-bandeja";

export const dynamic = "force-dynamic";

/** Los casos que Central le deriva a Facturación (Contabilidad) (0573, Santos 21-10). */
export default async function CasosDeCentralFacturacionPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const perfil = await requerirPerfil();
  const { ver } = await searchParams;
  return <CasosCentralBandeja lado="area" area="facturacion" ver={ver} perfilId={perfil.id} baseHref="/facturacion/casos" />;
}
