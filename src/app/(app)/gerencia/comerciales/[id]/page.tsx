import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PanelGestionComercial } from "@/components/crm/panel-gestion-comercial";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { VisitasEquipo } from "@/components/crm/visitas-equipo";
import { cargarVisitasEquipo } from "@/lib/visitas-equipo";
import { lunesDe, sumarDias } from "@/lib/calendario";
import { hoyLima } from "@/lib/periodo";

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

  // Las visitas de ESTE comercial, la misma lista que «Visitas del equipo» en
  // Supervisión (ing. Carlos, 01-10 11:05: «de cada agenda comercial no vi»).
  // La semana del día que trae la tarjeta (`hasta`), o la de hoy.
  const hoy = hoyLima();
  const fecha = sp.hasta && /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta) ? sp.hasta : hoy;
  const lunes = lunesDe(fecha);
  const domingo = sumarDias(lunes, 6);
  const visitas = await cargarVisitasEquipo(supabase, { desde: lunes, hasta: domingo, hoy, ids: [id] });

  return (
    <div className="space-y-4">
      <PanelGestionComercial
        comercialId={id}
        nombre={codigo ? `${perfil.nombre} (${codigo})` : perfil.nombre}
        searchParams={sp}
        esGerencia
      />
      <SeccionPanel titulo="Visitas y videollamadas de la semana" id="visitas">
        <VisitasEquipo
          lista={visitas}
          nombres={new Map([[id, perfil.nombre]])}
          fecha={fecha}
          desde={lunes}
          hasta={domingo}
          hoy={hoy}
          unComercial
        />
      </SeccionPanel>
    </div>
  );
}
