import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo, type PresetPeriodo } from "@/lib/periodo";
import { cargarResumenGerencia, usd } from "@/lib/reportes";
import { fechaCalendarioLarga } from "@/lib/fechas";
import { FiltroPeriodo } from "@/components/crm/filtro-periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Velocimetro } from "@/components/crm/velocimetro";
import { Kpi } from "@/components/crm/kpi";
import { GraficoBarras } from "@/components/crm/grafico-barras";
import { LeyendaSerie, barraMensualPorSerie } from "@/components/crm/leyenda-serie";

// Panel individual del comercial. Lo ve el propio comercial (/comercial/
// mi-gestion) y gerencia (/gerencia/comerciales/[id]). Todos los números
// salen de resumen_gerencia(p_comercial) — antes se traían las ~800
// oportunidades del comercial y se hacía `.in(oportunidad_id, [...])`, que
// excede el largo de URL de PostgREST y devolvía vacío: el velocímetro
// mostraba 0 aunque hubiera ventas (reportado por Darwin 2026-08-18).

const PRESETS: PresetPeriodo[] = ["mes", "mes_anterior", "90d", "anio", "12m"];

export async function PanelGestionComercial({
  comercialId,
  nombre,
  searchParams,
  esGerencia,
}: {
  comercialId: string;
  nombre: string;
  searchParams: { desde?: string; hasta?: string; historico?: string };
  esGerencia: boolean;
}) {
  const periodo = resolverPeriodo(searchParams, "mes");
  const incluirHistorico = searchParams.historico !== "no";
  const supabase = await createClient();

  const [resumen, { data: rechazadas }] = await Promise.all([
    cargarResumenGerencia(supabase, { ...periodo, comercialId, incluirHistorico }),
    supabase
      .from("oportunidades")
      .select("catalogo_motivos_rechazo(nombre)")
      .eq("comercial_id", comercialId)
      .eq("etapa", "rechazada")
      .gte("cerrada_at", `${periodo.desde}T00:00:00`)
      .lte("cerrada_at", `${periodo.hasta}T23:59:59`),
  ]);

  const k = resumen?.kpis;
  const yo = resumen?.por_comercial[0];
  const conteoMotivos = new Map<string, number>();
  for (const o of rechazadas ?? []) {
    const motivo = (o.catalogo_motivos_rechazo as unknown as { nombre: string } | null)?.nombre ?? "Sin motivo";
    conteoMotivos.set(motivo, (conteoMotivos.get(motivo) ?? 0) + 1);
  }
  const motivos = Array.from(conteoMotivos.entries()).sort((a, b) => b[1] - a[1]);
  const tasaCierre = k && k.op_ganadas + k.op_rechazadas > 0 ? Math.round((k.op_ganadas / (k.op_ganadas + k.op_rechazadas)) * 100) : null;

  return (
    <div className="space-y-4">
      <FiltroPeriodo {...periodo} presetActivo={periodo.preset} presets={PRESETS} incluirHistorico={esGerencia ? incluirHistorico : undefined} />

      <p className="px-1 text-xs text-muted-foreground">
        {nombre} · del <span className="font-medium text-foreground">{fechaCalendarioLarga(periodo.desde)}</span> al{" "}
        <span className="font-medium text-foreground">{fechaCalendarioLarga(periodo.hasta)}</span>
      </p>

      {!resumen || !k ? (
        <SeccionPanel titulo="Sin datos">
          <p className="text-sm text-muted-foreground">No se pudo cargar el resumen.</p>
        </SeccionPanel>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
            <SeccionPanel titulo={periodo.preset === "mes" ? "Meta del mes" : `Meta del período (${k.meses_periodo} mes${k.meses_periodo === 1 ? "" : "es"})`}>
              <Velocimetro ventasMes={Math.round(k.ventas_usd_equiv)} meta={yo && yo.meta_periodo > 0 ? yo.meta_periodo : null} />
            </SeccionPanel>

            <div className="grid grid-cols-2 gap-3">
              <Kpi etiqueta="Ventas cerradas" valor={k.n_ventas} sub={`ticket promedio ${usd(k.ticket_promedio_usd)}`} />
              <Kpi etiqueta="Clientes que compraron" valor={k.clientes_con_venta} sub={`${k.clientes_nuevos} nuevos · ${k.clientes_recurrentes} recurrentes`} />
              {/* "Cotizaciones EN EL CRM": el histórico Excel no trae las hojas
                  de cotización, así que este número solo mide lo cotizado con
                  el cotizador. Sin ese apellido se leía como toda la actividad
                  del año (11 cotizaciones junto a 112 ventas). */}
              <Kpi
                etiqueta="Cotizaciones en el CRM"
                valor={k.cot_creadas}
                sub={`${k.cot_enviadas} marcada${k.cot_enviadas === 1 ? "" : "s"} enviada${k.cot_enviadas === 1 ? "" : "s"}${yo && yo.cotizado_usd > 0 ? ` · ${usd(yo.cotizado_usd)} cotizados` : ""}`}
              />
              <Kpi etiqueta="Pipeline propio" valor={Math.round(k.pipeline_usd)} prefijo="US$ " sub={`${k.n_abiertas} oportunidades abiertas hoy`} />
            </div>
          </div>

          {k.cot_historicas_periodo > 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
              Además de las cotizaciones del CRM, en este período hay{" "}
              <b className="text-foreground">{k.cot_historicas_periodo}</b> presupuesto
              {k.cot_historicas_periodo === 1 ? "" : "s"} del histórico Excel. Solo se conocen los que
              terminaron en venta —las hojas de cotización anteriores al CRM no se cargaron—, así que el
              total realmente cotizado en esos meses fue mayor. Desde que se cotiza en el CRM, el conteo es exacto.
            </p>
          )}

          <SeccionPanel titulo="Ventas por mes — últimos 12 meses (Efameinsa vs Open)">
            <GraficoBarras datos={resumen.serie_mensual.map(barraMensualPorSerie)} resaltarUltima />
            <LeyendaSerie k={k} />
          </SeccionPanel>

          <div className="grid gap-3 lg:grid-cols-2">
            <SeccionPanel titulo="Cierre y rechazos del período">
              <div className="grid grid-cols-3 gap-3">
                <Mini etiqueta="Ganadas" valor={k.op_ganadas} exito />
                <Mini etiqueta="Rechazadas" valor={k.op_rechazadas} />
                <Mini etiqueta="Tasa de cierre" valor={tasaCierre === null ? "—" : `${tasaCierre}%`} />
              </div>
              {motivos.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs">
                  {motivos.map(([m, n]) => (
                    <li key={m} className="flex justify-between border-b border-border py-1 last:border-0">
                      <span className="text-foreground">{m}</span>
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">Sin rechazos en el período.</p>
              )}
              <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
                Solo oportunidades gestionadas en el CRM.
                {k.ventas_historicas_periodo > 0 && (
                  <>
                    {" "}
                    Además, {k.ventas_historicas_periodo} venta{k.ventas_historicas_periodo === 1 ? "" : "s"} del período viene
                    {k.ventas_historicas_periodo === 1 ? "" : "n"} del histórico Excel (ya cerradas al importarse; cuentan en el velocímetro, no
                    en la tasa de cierre).
                  </>
                )}
              </p>
            </SeccionPanel>

            <SeccionPanel titulo="Clientes con mayor compra">
              {resumen.top_clientes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {resumen.top_clientes.slice(0, 8).map((c) => (
                    <li key={c.cuenta_id} className="flex items-center justify-between gap-3 border-b border-border py-1.5 last:border-0">
                      <Link
                        href={esGerencia ? `/gerencia/clientes/${c.cuenta_id}` : `/comercial/cartera/${c.cuenta_id}`}
                        className="truncate text-foreground hover:underline"
                        title={c.razon_social}
                      >
                        {c.razon_social}
                      </Link>
                      <span className="shrink-0 tabular-nums">
                        <b className="text-foreground">{usd(c.monto_usd)}</b>
                        <span className="text-muted-foreground"> · {c.n}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SeccionPanel>
          </div>
        </>
      )}
    </div>
  );
}

function Mini({ etiqueta, valor, exito }: { etiqueta: string; valor: number | string; exito?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={"mt-0.5 text-lg font-bold tabular-nums " + (exito ? "text-[#1E7F4F]" : "text-foreground")}>{valor}</p>
    </div>
  );
}
