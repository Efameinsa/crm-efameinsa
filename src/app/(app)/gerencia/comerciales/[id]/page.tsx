import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PanelGestionComercial } from "@/components/crm/panel-gestion-comercial";

export default async function ComercialGerenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre")
    .eq("id", id)
    .eq("rol", "comercial")
    .maybeSingle();

  if (!perfil) notFound();

  return <PanelGestionComercial comercialId={id} nombre={perfil.nombre} />;
}
