import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VistaOportunidades } from "@/components/crm/vista-oportunidades";
import type { OportunidadKanban } from "@/components/crm/pipeline-kanban";

export default async function OportunidadesPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const [{ data: oportunidades }, { data: motivos }] = await Promise.all([
    supabase
      .from("oportunidades")
      .select(
        "id, etapa, intencion, monto_estimado, moneda, updated_at, cuentas(razon_social), cotizaciones(estado_aprobacion, created_at)",
      )
      .eq("comercial_id", perfil.id)
      .order("updated_at", { ascending: false }),
    supabase.from("catalogo_motivos_rechazo").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  const datos: OportunidadKanban[] = (oportunidades ?? []).map((op) => {
    const cotizaciones = (op.cotizaciones as unknown as { estado_aprobacion: string; created_at: string }[]) ?? [];
    const ultima = [...cotizaciones].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return {
      id: op.id,
      etapa: op.etapa,
      razon_social: (op.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "Cuenta sin nombre",
      intencion: op.intencion,
      monto_estimado: op.monto_estimado,
      moneda: op.moneda,
      updated_at: op.updated_at,
      cotizacion_pendiente: ultima?.estado_aprobacion === "pendiente_gerencia",
      cotizacion_rechazada: ultima?.estado_aprobacion === "rechazada_gerencia",
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mis oportunidades</CardTitle>
      </CardHeader>
      <CardContent>
        <VistaOportunidades oportunidades={datos} motivos={motivos ?? []} />
      </CardContent>
    </Card>
  );
}
