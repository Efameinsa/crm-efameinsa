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
    .select("nombre, codigo_comercial, codigo_anterior")
    .eq("id", id)
    .eq("rol", "comercial")
    .maybeSingle();

  if (!perfil) notFound();

  // "Brenda Taboada (C1 · antes C8)": su historial de ventas viene del código
  // anterior, así que el encabezado lo dice en vez de dejar la duda.
  const codigo = perfil.codigo_comercial
    ? `${perfil.codigo_comercial}${perfil.codigo_anterior ? ` · antes ${perfil.codigo_anterior}` : ""}`
    : null;

  return (
    <PanelGestionComercial
      comercialId={id}
      nombre={codigo ? `${perfil.nombre} (${codigo})` : perfil.nombre}
      searchParams={sp}
      esGerencia
    />
  );
}
