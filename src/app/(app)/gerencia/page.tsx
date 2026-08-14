import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kpi } from "@/components/crm/kpi";
import { BarraEtapa } from "@/components/crm/barra-etapa";
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
    supabase.from("ventas").select("monto_total").gte("fecha_venta", inicioMes.toISOString().slice(0, 10)),
    supabase.from("oportunidades").select("monto_estimado").not("etapa", "in", "(venta,rechazada,derivada)"),
    supabase.from("oportunidades").select("etapa, comercial_id"),
    supabase.from("cotizaciones").select("total, oportunidades(comercial_id)"),
    supabase.from("ventas").select("monto_total, oportunidades(comercial_id)"),
    supabase.from("perfiles").select("id, nombre").eq("rol", "comercial").eq("activo", true),
  ]);

  const ventasDelMes = (ventasMes ?? []).reduce((acc, v) => acc + v.monto_total, 0);
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
    return { nombre: p.nombre, abiertas, cotizado, vendido };
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
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Comercial</th>
                  <th className="pb-2 pl-2 text-right font-medium">Abiertas</th>
                  <th className="pb-2 pl-2 text-right font-medium">Cotizado</th>
                  <th className="pb-2 pl-2 text-right font-medium">Vendido</th>
                </tr>
              </thead>
              <tbody>
                {porComercial.map((c) => (
                  <tr key={c.nombre} className="border-b border-border last:border-0">
                    <td className="py-2 text-foreground">{c.nombre}</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{c.abiertas}</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{c.cotizado.toLocaleString("es-PE")}</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{c.vendido.toLocaleString("es-PE")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        Rechazadas: {(oportunidadesTodas ?? []).filter((o) => o.etapa === "rechazada").length} este período.
      </p>
    </div>
  );
}
