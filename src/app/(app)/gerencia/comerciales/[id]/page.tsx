import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PanelGestionComercial } from "@/components/crm/panel-gestion-comercial";

export const dynamic = "force-dynamic";

export default async function ComercialGerenciaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string; historico?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const supabase = await createClient();

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre")
    .eq("id", id)
    .eq("rol", "comercial")
    .maybeSingle();

  if (!perfil) notFound();

  return <PanelGestionComercial comercialId={id} nombre={perfil.nombre} searchParams={sp} esGerencia />;
}
