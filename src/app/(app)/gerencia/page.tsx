import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/periodo";
import { cargarResumenGerencia, ETIQUETA_VIA, usd } from "@/lib/reportes";
import { fechaCalendarioLarga } from "@/lib/fechas";
import { FiltroPeriodo } from "@/components/crm/filtro-periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Kpi } from "@/components/crm/kpi";
import { BarraEtapa } from "@/components/crm/barra-etapa";
import { GraficoBarras } from "@/components/crm/grafico-barras";
import { TablaPorComercial } from "@/components/crm/tabla-por-comercial";
import { TipoCambioInline } from "@/components/crm/tipo-cambio-inline";
import type { EtapaOportunidad } from "@/types/database";

// Depende de searchParams y de datos vivos: nunca cachear.
export const dynamic = "force-dynamic";

const ETAPAS: EtapaOportunidad[] = ["asignada", "filtrada", "cotizada", "seguimiento", "potencial", "venta"];
const ETIQUETA_ETAPA: Record<string, string> = {
  asignada: "Asignada",
  filtrada: "Filtrada",
  cotizada: "Cotizada",
  seguimiento: "Seguimiento",
  potencial: "Potencial",
  venta: "Venta",
};

export default async function GerenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; comercial?: string; historico?: string }>;
}) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp, "mes");
  const comercialId = sp.comercial || null;
  const incluirHistorico = sp.historico !== "no";

  const supabase = await createClient();
  const [{ data: comerciales }, resumen] = await Promise.all([
    supabase.from("perfiles").select("id, nombre").eq("rol", "comercial").eq("activo", true).order("codigo_comercial"),
    cargarResumenGerencia(supabase, { ...periodo, comercialId, incluirHistorico }),
  ]);

  if (!resumen) {
    return (
      <div className="space-y-4">
        <FiltroPeriodo {...periodo} presetActivo={periodo.preset} comerciales={comerciales ?? []} comercialId={comercialId} incluirHistorico={incluirHistorico} />
        <SeccionPanel titulo="Sin datos">
          <p className="text-sm text-muted-foreground">No se pudo cargar el resumen. Intente de nuevo en unos segundos.</p>
        </SeccionPanel>
      </div>
    );
  }

  const k = resumen.kpis;
  const totalEmbudo = Object.values(resumen.embudo).reduce((a, b) => a + b, 0);
  const maximoEmbudo = Math.max(1, ...ETAPAS.map((e) => resumen.embudo[e] ?? 0));
  const tasaCierre = k.op_ganadas + k.op_rechazadas > 0 ? Math.round((k.op_ganadas / (k.op_ganadas + k.op_rechazadas)) * 100) : null;
  const totalVia = resumen.via_adquisicion.reduce((a, v) => a + v.monto_usd, 0);
  const pctRecurrentes = k.ventas_usd_equiv > 0 ? Math.round((k.monto_recurrentes_usd / k.ventas_usd_equiv) * 100) : 0;
  const cal = resumen.calidad_datos;
  const hayAlertas = k.leads_sin_asignar > 0 || k.cot_por_aprobar > 0;

  return (
    <div className="space-y-4">
      <FiltroPeriodo
        {...periodo}
        presetActivo={periodo.preset}
        comerciales={comerciales ?? []}
        comercialId={comercialId}
        incluirHistorico={incluirHistorico}
      />

      <p className="px-1 text-xs text-muted-foreground">
        Del <span className="font-medium text-foreground">{fechaCalendarioLarga(periodo.desde)}</span> al{" "}
        <span className="font-medium text-foreground">{fechaCalendarioLarga(periodo.hasta)}</span>
        {comercialId && comerciales && (
          <> · {comerciales.find((c) => c.id === comercialId)?.nombre ?? "comercial"}</>
        )}
        {!incluirHistorico && <> · solo lo registrado en el CRM (histórico Excel excluido)</>}
        {" "}· <TipoCambioInline valor={k.tc_usd_pen} editable /> USD→PEN
        {k.ventas_pen > 0 && <> (incluye S/ {Math.round(k.ventas_pen).toLocaleString("es-PE")} convertidos a US$)</>}
      </p>

      {hayAlertas && (
        <div className="grid gap-3 sm:grid-cols-2">
          {k.leads_sin_asignar > 0 && (
            <Link href="/central" className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 transition-shadow hover:shadow-md">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Requiere acción</p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">
                  {k.leads_sin_asignar} lead{k.leads_sin_asignar === 1 ? "" : "s"} sin asignar
                </p>
                <p className="text-[11px] text-muted-foreground">en la bandeja de Central</p>
              </div>
              <ArrowRight className="size-4 text-amber-700" />
            </Link>
          )}
          {k.cot_por_aprobar > 0 && (
            <Link href="/gerencia/aprobaciones" className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 p-4 transition-shadow hover:shadow-md">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Requiere su aprobación</p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">
                  {k.cot_por_aprobar} cotizaci{k.cot_por_aprobar === 1 ? "ón" : "ones"} bajo lista
                </p>
                <p className="text-[11px] text-muted-foreground">esperando decisión de gerencia</p>
              </div>
              <ArrowRight className="size-4 text-primary" />
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Ventas del período" valor={Math.round(k.ventas_usd_equiv)} prefijo="US$ " sub={`${k.n_ventas} venta${k.n_ventas === 1 ? "" : "s"} cerrada${k.n_ventas === 1 ? "" : "s"}`} />
        <Kpi etiqueta="Ticket promedio" valor={Math.round(k.ticket_promedio_usd)} prefijo="US$ " sub="por venta cerrada" />
        <Kpi
          etiqueta="Clientes que compraron"
          valor={k.clientes_con_venta}
          sub={`${k.clientes_nuevos} nuevo${k.clientes_nuevos === 1 ? "" : "s"} · ${k.clientes_recurrentes} recurrente${k.clientes_recurrentes === 1 ? "" : "s"}`}
        />
        <Kpi etiqueta="Pipeline abierto" valor={Math.round(k.pipeline_usd)} prefijo="US$ " sub={`${k.n_abiertas} oportunidad${k.n_abiertas === 1 ? "" : "es"} en curso hoy`} />
      </div>

      <SeccionPanel titulo="Ventas por mes — últimos 12 meses">
        <GraficoBarras
          datos={resumen.serie_mensual.map((p) => ({
            clave: p.mes,
            etiqueta: new Date(`${p.mes}-01T12:00:00`).toLocaleDateString("es-PE", { month: "short", year: "2-digit" }),
            valor: p.ventas_usd,
            valorTexto: p.ventas_usd >= 1000 ? `${Math.round(p.ventas_usd / 1000)}k` : String(Math.round(p.ventas_usd)),
            detalle: `${p.mes}: ${usd(p.ventas_usd)} en ${p.n_ventas} venta${p.n_ventas === 1 ? "" : "s"}`,
          }))}
          resaltarUltima
        />
      </SeccionPanel>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <SeccionPanel titulo="Rendimiento por comercial">
          <TablaPorComercial filas={resumen.por_comercial} />
          <p className="mt-3 text-[11px] text-muted-foreground">
            % meta = vendido en el período ÷ (meta mensual × {k.meses_periodo} mes{k.meses_periodo === 1 ? "" : "es"}). Clic en una fila para ver el
            detalle.
          </p>
        </SeccionPanel>

        <SeccionPanel titulo="Embudo de oportunidades">
          {totalEmbudo === 0 ? (
            <p className="text-sm text-muted-foreground">No se crearon oportunidades en este período.</p>
          ) : (
            <div className="space-y-1">
              <p className="mb-2 text-[11px] text-muted-foreground">
                {totalEmbudo} oportunidad{totalEmbudo === 1 ? "" : "es"} creada{totalEmbudo === 1 ? "" : "s"} en el período, por etapa actual
                {(resumen.embudo.rechazada ?? 0) > 0 && <> · {resumen.embudo.rechazada} rechazada{resumen.embudo.rechazada === 1 ? "" : "s"}</>}
              </p>
              {ETAPAS.map((e) => (
                <BarraEtapa key={e} etiqueta={ETIQUETA_ETAPA[e]} total={resumen.embudo[e] ?? 0} maximo={maximoEmbudo} destacada={e === "venta"} />
              ))}
              {tasaCierre !== null && (
                <p className="pt-2 text-[11px] text-muted-foreground">
                  Tasa de cierre del período: <b className="text-foreground">{tasaCierre}%</b> ({k.op_ganadas} ganadas de{" "}
                  {k.op_ganadas + k.op_rechazadas} decididas)
                </p>
              )}
            </div>
          )}
        </SeccionPanel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SeccionPanel titulo="De dónde vienen las ventas">
          {resumen.via_adquisicion.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
          ) : (
            <div className="space-y-2">
              {resumen.via_adquisicion.map((v) => {
                const p = totalVia > 0 ? (v.monto_usd / totalVia) * 100 : 0;
                return (
                  <div key={v.via} className="grid grid-cols-[150px_1fr_auto] items-center gap-3 text-xs">
                    <span className="truncate text-foreground" title={ETIQUETA_VIA[v.via] ?? v.via}>
                      {ETIQUETA_VIA[v.via] ?? v.via}
                    </span>
                    <div className="h-5 overflow-hidden rounded-md bg-secondary">
                      <div className="h-full rounded-md bg-primary/80" style={{ width: `${Math.max(p, v.monto_usd > 0 ? 2 : 0)}%` }} />
                    </div>
                    <span className="w-28 text-right tabular-nums text-muted-foreground">
                      <b className="text-foreground">{usd(v.monto_usd)}</b> · {v.n}
                    </span>
                  </div>
                );
              })}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Si la venta nace de un lead del CRM, se atribuye a su campaña exacta (Google Ads / Meta Ads). Si no, se usa la
                procedencia que el comercial declaró en su hoja histórica (Facebook, página web, referido, visita en ruta…) —
                menos exacta, pero es lo que la empresa registró durante años. &ldquo;Página web&rdquo; era el valor por defecto de esa
                hoja: incluye orgánico y publicidad sin distinguir.
              </p>
            </div>
          )}
        </SeccionPanel>

        <SeccionPanel titulo="Recurrencia y valor del cliente">
          <div className="grid grid-cols-2 gap-3">
            <Metrica etiqueta="Ventas a clientes recurrentes" valor={`${pctRecurrentes}%`} ayuda={`${usd(k.monto_recurrentes_usd)} del período`} destacada />
            <Metrica etiqueta="Ventas a clientes nuevos" valor={`${100 - pctRecurrentes}%`} ayuda={`${usd(k.monto_nuevos_usd)} del período`} />
            <Metrica etiqueta="Valor de vida promedio (CLTV)" valor={usd(k.cltv_promedio_usd)} ayuda={`por cliente, sobre ${k.clientes_historicos.toLocaleString("es-PE")} clientes con compra`} />
            <Metrica
              etiqueta="CLTV de quien repite"
              valor={usd(k.cltv_recurrentes_usd)}
              ayuda={`${k.clientes_recurrentes_historicos} clientes con 2+ compras · ${k.frecuencia_promedio.toFixed(1)} compras/cliente en promedio`}
              exito
            />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Recurrente = ya había comprado antes del inicio del período. El CLTV se calcula sobre todo el historial disponible, no solo el
            período.
          </p>
        </SeccionPanel>
      </div>

      {resumen.top_clientes.length > 0 && (
        <SeccionPanel titulo="Clientes con mayor compra en el período">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 pl-2 font-medium">Comercial</th>
                  <th className="pb-2 pl-2 text-right font-medium">Compras</th>
                  <th className="pb-2 pl-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumen.top_clientes.map((c) => (
                  <tr key={c.cuenta_id} className="border-b border-border last:border-0 hover:bg-accent">
                    <td className="py-2">
                      <Link href={`/gerencia/clientes/${c.cuenta_id}`} className="text-foreground hover:underline">
                        {c.razon_social}
                      </Link>
                    </td>
                    <td className="py-2 pl-2 text-muted-foreground">{c.comercial}</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{c.n}</td>
                    <td className="py-2 pl-2 text-right font-semibold tabular-nums text-foreground">{usd(c.monto_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SeccionPanel>
      )}

      <div className="rounded-xl border border-dashed border-border p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <AlertTriangle className="size-3.5" /> Qué le resta fiabilidad a estos números
        </p>
        <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <li>
            <b className="text-foreground">{cal.ventas_historicas_total.toLocaleString("es-PE")}</b> ventas vienen del histórico Excel (
            {cal.ventas_crm_total} registradas en el CRM). El histórico no trae serie EFAMEINSA/OPEN ni origen del cliente.
          </li>
          <li>
            <b className="text-foreground">{cal.ventas_historicas_sin_monto.toLocaleString("es-PE")}</b> ventas históricas no tienen monto en la hoja
            original: cuentan como cliente pero no suman dinero.
          </li>
          <li>
            <b className="text-foreground">{cal.cuentas_sin_documento.toLocaleString("es-PE")}</b> clientes sin RUC/DNI —{" "}
            <Link href="/gerencia/clientes?sin_doc=1" className="underline">
              ver lista
            </Link>
            . Pueden existir duplicados entre ellos.
          </li>
          <li>
            Leads de publicidad registrados desde el {cal.primer_lead_publicidad ? fechaCalendarioLarga(cal.primer_lead_publicidad) : "—"}: la
            atribución de ventas a campañas solo es posible desde esa fecha.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Metrica({ etiqueta, valor, ayuda, destacada, exito }: { etiqueta: string; valor: string; ayuda: string; destacada?: boolean; exito?: boolean }) {
  return (
    <div
      className={
        "rounded-lg border p-3 " +
        (exito ? "border-[#1E7F4F]/30 bg-[#1E7F4F]/5" : destacada ? "border-primary/30 bg-primary/5" : "border-border")
      }
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={"mt-0.5 text-lg font-bold tabular-nums " + (exito ? "text-[#1E7F4F]" : destacada ? "text-primary" : "text-foreground")}>{valor}</p>
      <p className="text-[10px] leading-tight text-muted-foreground">{ayuda}</p>
    </div>
  );
}
