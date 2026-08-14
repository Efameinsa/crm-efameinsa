import { requerirPerfil } from "@/lib/auth";
import { PanelGestionComercial } from "@/components/crm/panel-gestion-comercial";

export default async function MiGestionPage() {
  const perfil = await requerirPerfil();
  return <PanelGestionComercial comercialId={perfil.id} nombre={perfil.nombre} />;
}
