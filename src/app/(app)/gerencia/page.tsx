import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kpi } from "@/components/crm/kpi";
import { BarraEtapa } from "@/components/crm/barra-etapa";
import { TablaPorComercial } from "@/components/crm/tabla-por-comercial";
import type { EtapaOportunidad } from "@/types/database";

const ETAPAS: EtapaOportunidad[] = ["asignada", "filtrada", "cotizada", "seguimiento", "potencial", "venta"];
const ETIQUETA_ETAPA: Record<string, string> = {
  asignada: "Asignada",
  filtrada: "Filtrada",
  cotizada: "Cotizada",
  seguimiento: "Seguimiento",
  potencial: "Potencial",
  venta: "Venta",
};

export default async function GerenciaPage() {
  const supabase = await createClient();
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [
    { count: leadsSinAsignar },
    { count: cotizacionesPorAprobar },
    { data: ventasMes },
    { data: oportunidadesAbiertas },
    { data: oportunidadesTodas },
    { data: cotizacionesTodas },
    { data: ventasTodas },
    { data: perfilesComerciales },
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("estado", "pendiente_triaje"),
    supabase.from("cotizaciones").select("id", { count: "exact", head: true }).eq("estado_aprobacion", "pendiente_gerencia"),
    supabase.from("ventas").select("monto_total, oportunidades(comercial_id)").gte("fecha_venta", inicioMes.toISOString().slice(0, 10)),
    supabase.from("oportunidades").select("monto_estimado").not("etapa", "in", "(venta,rechazada,derivada)"),
    supabase.from("oportunidades").select("etapa, comercial_id"),
    supabase.from("cotizaciones").select("total, oportunidades(comercial_id)"),
    supabase.from("ventas").select("monto_total, oportunidades(comercial_id)"),
    supabase.from("perfiles").select("id, nombre, meta_mensual").eq("rol", "comercial").eq("activo", true),
  ]);

  const ventasDelMes = (ventasMes ?? []).reduce((acc, v) => acc + v.monto_total, 0);

  const ventasMesPorComercial = new Map<string, number>();
  for (const v of ventasMes ?? []) {
    const comercialId = (v.oportunidades as unknown as { comercial_id: string } | null)?.comercial_id;
    if (comercialId) ventasMesPorComercial.set(comercialId, (ventasMesPorComercial.get(comercialId) ?? 0) + v.monto_total);
  }
  const pipelineEstimado = (oportunidadesAbiertas ?? []).reduce((acc, o) => acc + (o.monto_estimado ?? 0), 0);

  const conteosPorEtapa = ETAPAS.map((etapa) => ({
    etapa,
    total: (oportunidadesTodas ?? []).filter((o) => o.etapa === etapa).length,
  }));
  const maximo = Math.max(1, ...conteosPorEtapa.map((c) => c.total));

  const porComercial = (perfilesComerciales ?? []).map((p) => {
    const abiertas = (oportunidadesTodas ?? []).filter((o) => o.comercial_id === p.id && !["venta", "rechazada", "derivada"].includes(o.etapa)).length;
    const cotizado = (cotizacionesTodas ?? [])
      .filter((c) => (c.oportunidades as unknown as { comercial_id: string } | null)?.comercial_id === p.id)
      .reduce((acc, c) => acc + c.total, 0);
    const vendido = (ventasTodas ?? [])
      .filter((v) => (v.oportunidades as unknown as { comercial_id: string } | null)?.comercial_id === p.id)
      .reduce((acc, v) => acc + v.monto_total, 0);
    const vendidoMes = ventasMesPorComercial.get(p.id) ?? 0;
    const pctMeta = p.meta_mensual ? Math.round((vendidoMes / p.meta_mensual) * 100) : null;
    return { id: p.id, nombre: p.nombre, abiertas, cotizado, vendido, pctMeta };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi etiqueta="Leads sin asignar" valor={leadsSinAsignar ?? 0} sub="en bandeja de Central" />
        <Kpi
          etiqueta="Por aprobar"
          valor={cotizacionesPorAprobar ?? 0}
          sub="cotizaciones bajo lista"
          alerta={(cotizacionesPorAprobar ?? 0) > 0}
          href="/gerencia/aprobaciones"
        />
        <Kpi etiqueta="Ventas del mes" valor={ventasDelMes} prefijo="USD " sub="cerradas este mes" />
        <Kpi etiqueta="Pipeline estimado" valor={pipelineEstimado} prefijo="USD " sub="oportunidades abiertas" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Embudo por etapa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {conteosPorEtapa.map((c, i) => {
              const anterior = i > 0 ? conteosPorEtapa[i - 1].total : null;
              const conversion = anterior && anterior > 0 ? Math.round((c.total / anterior) * 100) : null;
              return (
                <div key={c.etapa}>
                  {conversion !== null && (
                    <p className="pl-[122px] text-[11px] text-muted-foreground">
                      <b className="text-foreground">{conversion}%</b> pasa a {ETIQUETA_ETAPA[c.etapa].toLowerCase()}
                    </p>
                  )}
                  <BarraEtapa etiqueta={ETIQUETA_ETAPA[c.etapa]} total={c.total} maximo={maximo} destacada={c.etapa === "venta"} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por comercial</CardTitle>
          </CardHeader>
          <CardContent>
            <TablaPorComercial filas={porComercial} />
          </CardContent>
        </Card>
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        Rechazadas: {(oportunidadesTodas ?? []).filter((o) => o.etapa === "rechazada").length} este período.
      </p>
    </div>
  );
}
