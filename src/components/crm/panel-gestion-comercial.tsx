import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Velocimetro } from "@/components/crm/velocimetro";
import { Kpi } from "@/components/crm/kpi";

const ETAPAS_ABIERTAS = ["asignada", "filtrada", "cotizada", "seguimiento", "potencial"];

export async function PanelGestionComercial({ comercialId, nombre }: { comercialId: string; nombre: string }) {
  const supabase = await createClient();
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const inicioMesISO = inicioMes.toISOString();
  const inicioMesFecha = inicioMesISO.slice(0, 10);

  const [{ data: perfil }, { data: misOportunidades }] = await Promise.all([
    supabase.from("perfiles").select("meta_mensual").eq("id", comercialId).maybeSingle(),
    supabase
      .from("oportunidades")
      .select("id, etapa, monto_estimado, cerrada_at, catalogo_motivos_rechazo(nombre)")
      .eq("comercial_id", comercialId),
  ]);

  const opIds = (misOportunidades ?? []).map((o) => o.id);

  const [{ data: ventasMesData }, { data: cotizacionesEnviadasData }] = await Promise.all([
    opIds.length
      ? supabase.from("ventas").select("monto_total").in("oportunidad_id", opIds).gte("fecha_venta", inicioMesFecha)
      : Promise.resolve({ data: [] as { monto_total: number }[] }),
    opIds.length
      ? supabase.from("cotizaciones").select("id").in("oportunidad_id", opIds).gte("enviada_at", inicioMesISO)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);

  const ventasMesMonto = (ventasMesData ?? []).reduce((acc, v) => acc + v.monto_total, 0);
  const ventasMesNumero = (ventasMesData ?? []).length;
  const cotizacionesEnviadas = (cotizacionesEnviadasData ?? []).length;
  const pipelinePropio = (misOportunidades ?? [])
    .filter((o) => ETAPAS_ABIERTAS.includes(o.etapa))
    .reduce((acc, o) => acc + (o.monto_estimado ?? 0), 0);

  const rechazadasDelMes = (misOportunidades ?? []).filter(
    (o) => o.etapa === "rechazada" && o.cerrada_at && o.cerrada_at >= inicioMesISO,
  );
  const conteoMotivos = new Map<string, number>();
  for (const o of rechazadasDelMes) {
    const motivo = (o.catalogo_motivos_rechazo as unknown as { nombre: string } | null)?.nombre ?? "Sin motivo";
    conteoMotivos.set(motivo, (conteoMotivos.get(motivo) ?? 0) + 1);
  }
  const motivoMasFrecuente = Array.from(conteoMotivos.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <div className="space-y-4">
      <SeccionPanel titulo={`Meta del mes — ${nombre}`}>
        <Velocimetro ventasMes={ventasMesMonto} meta={perfil?.meta_mensual ?? null} />
      </SeccionPanel>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi etiqueta="Ventas del mes" valor={ventasMesNumero} sub="cerradas este mes" />
        <Kpi etiqueta="Cotizaciones enviadas" valor={cotizacionesEnviadas} sub="este mes" />
        <Kpi etiqueta="Pipeline propio" valor={pipelinePropio} prefijo="USD " sub="oportunidades abiertas" />
        <Kpi etiqueta="Rechazadas" valor={rechazadasDelMes.length} sub="este mes" />
      </div>

      {rechazadasDelMes.length > 0 && motivoMasFrecuente && (
        <p className="px-1 text-xs text-muted-foreground">
          Motivo de rechazo más frecuente este mes: <span className="font-medium text-foreground">{motivoMasFrecuente}</span>
        </p>
      )}
    </div>
  );
}
