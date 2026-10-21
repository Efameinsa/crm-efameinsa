import { requerirPerfil } from "@/lib/auth";
import { CasosCentralBandeja } from "@/components/crm/casos-central-bandeja";

export const dynamic = "force-dynamic";

/** Lo que Central derivó a Finanzas y Facturación, y en qué quedó (0573, Santos 21-10). */
export default async function CasosCentralPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const perfil = await requerirPerfil();
  const { ver } = await searchParams;
  return <CasosCentralBandeja lado="central" ver={ver} perfilId={perfil.id} baseHref="/central/casos" />;
}
