import { requerirPerfil } from "@/lib/auth";
import { PanelGestionComercial } from "@/components/crm/panel-gestion-comercial";

export const dynamic = "force-dynamic";

export default async function MiGestionPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const [perfil, sp] = await Promise.all([requerirPerfil(), searchParams]);
  return <PanelGestionComercial comercialId={perfil.id} nombre={perfil.nombre} searchParams={sp} esGerencia={false} />;
}
