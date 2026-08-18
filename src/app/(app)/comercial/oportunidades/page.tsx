import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VistaOportunidades } from "@/components/crm/vista-oportunidades";
import type { OportunidadKanban } from "@/components/crm/pipeline-kanban";

export default async function OportunidadesPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  // Dos consultas a propósito. Antes se traían TODAS las oportunidades del
  // comercial ordenadas por updated_at: supabase-js corta en 1.000 filas y
  // C5 tiene 1.100+ ventas históricas importadas (todas con updated_at de la
  // importación, más reciente que sus 5 abiertas reales) → las abiertas
  // quedaban fuera del corte y el kanban salía vacío. Las abiertas se traen
  // completas (son pocas); las cerradas solo las de los últimos 90 días,
  // que es lo que el pie del kanban resume — el historial completo vive en
  // la ficha de cada cliente y en Mi gestión.
  const CAMPOS = "id, etapa, intencion, monto_estimado, moneda, updated_at, cuentas(razon_social), cotizaciones(estado_aprobacion, created_at)";
  const hace90 = new Date(new Date().getTime() - 90 * 86_400_000).toISOString();
  const [{ data: abiertas }, { data: cerradas }, { data: motivos }] = await Promise.all([
    supabase
      .from("oportunidades")
      .select(CAMPOS)
      .eq("comercial_id", perfil.id)
      .not("etapa", "in", "(venta,rechazada,derivada)")
      .order("updated_at", { ascending: false }),
    supabase
      .from("oportunidades")
      .select(CAMPOS)
      .eq("comercial_id", perfil.id)
      .in("etapa", ["venta", "rechazada", "derivada"])
      .gte("cerrada_at", hace90)
      .order("cerrada_at", { ascending: false })
      .limit(500),
    supabase.from("catalogo_motivos_rechazo").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  const oportunidades = [...(abiertas ?? []), ...(cerradas ?? [])];

  const datos: OportunidadKanban[] = oportunidades.map((op) => {
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
