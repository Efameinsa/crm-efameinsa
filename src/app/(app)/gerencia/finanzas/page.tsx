import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/periodo";
import { fechaCalendarioLarga } from "@/lib/fechas";
import { usd } from "@/lib/reportes";
import { cargarFinanzasMarketing, ETIQUETA_GRUPO, AYUDA_GRUPO, type GrupoAtribucion } from "@/lib/finanzas";
import { FiltroPeriodo } from "@/components/crm/filtro-periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Kpi } from "@/components/crm/kpi";
import { EstadoResultados } from "@/components/crm/estado-resultados";
import { TablaMesesFinanzas } from "@/components/crm/tabla-meses-finanzas";
import { ParetoCltv } from "@/components/crm/pareto-cltv";

export const dynamic = "force-dynamic";

const ORDEN_GRUPOS: GrupoAtribucion[] = ["publicidad", "relacion", "sin_atribucion", "otro"];
const COLOR_GRUPO: Record<GrupoAtribucion, string> = {
  publicidad: "bg-primary",
  relacion: "bg-[#1E7F4F]",
  sin_atribucion: "bg-muted-foreground/35",
  otro: "bg-[#2C2E35]/50",
};

export default async function FinanzasMarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp, "anio");
  const supabase = await createClient();
  const f = await cargarFinanzasMarketing(supabase, periodo);

  if (!f) {
    return (
      <div className="space-y-4">
        <FiltroPeriodo {...periodo} presetActivo={periodo.preset} />
        <SeccionPanel titulo="Sin datos">
          <p className="text-sm text-muted-foreground">No se pudo cargar el reporte. Intente de nuevo en unos segundos.</p>
        </SeccionPanel>
      </div>
    );
  }

  const { resultado: r, atribucion, recurrencia: rec, margen_pct } = f;
  const totalAtrib = ORDEN_GRUPOS.reduce((s, g) => s + (atribucion.por_grupo[g]?.monto_usd ?? 0), 0);
  const totalRec = rec.recurrentes_usd + rec.nuevos_usd;
  const pctRecurrentes = totalRec > 0 ? Math.round((rec.recurrentes_usd / totalRec) * 100) : 0;
  // Con margen bajo, la publicidad recién se paga sola cuando el ROAS supera
  // 1/margen: con 11 % hacen falta ~9×, no 2×. Es la cuenta que decide si
  // conviene subir la inversión.
  const roasEquilibrio = margen_pct > 0 ? 100 / margen_pct : null;
  const roasActual = r.inversion_publicitaria_usd > 0 ? r.ventas_usd / r.inversion_publicitaria_usd : null;

  return (
    <div className="space-y-4">
      <FiltroPeriodo {...periodo} presetActivo={periodo.preset} />

      <p className="px-1 text-xs text-muted-foreground">
        Del <span className="font-medium text-foreground">{fechaCalendarioLarga(periodo.desde)}</span> al{" "}
        <span className="font-medium text-foreground">{fechaCalendarioLarga(periodo.hasta)}</span> · margen bruto declarado{" "}
        <span className="font-medium text-foreground">{margen_pct}%</span> · T.C. {f.tc_usd_pen} — ambos se editan en{" "}
        <Link href="/admin/catalogos" className="underline">
          parámetros
        </Link>
        .
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Ventas del período" valor={Math.round(r.ventas_usd)} prefijo="US$ " sub={`${r.n_ventas} ventas`} />
        <Kpi etiqueta="Utilidad bruta estimada" valor={Math.round(r.utilidad_bruta_usd)} prefijo="US$ " sub={`margen ${margen_pct}%`} />
        <Kpi etiqueta="Inversión publicitaria" valor={Math.round(r.inversion_publicitaria_usd)} prefijo="US$ " sub="Google y Meta" />
        <Kpi
          etiqueta="Utilidad después de mkt"
          valor={Math.round(r.utilidad_despues_mkt_usd)}
          prefijo="US$ "
          sub={roasActual ? `ROAS ${roasActual.toFixed(1)}×` : "sin inversión en el período"}
          alerta={r.utilidad_despues_mkt_usd < 0}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <SeccionPanel titulo="Estado de resultados del período (estimado)">
          <EstadoResultados r={r} margenPct={margen_pct} />
          <p className="mt-3 text-[11px] text-muted-foreground">
            El CRM no conoce el costo de compra de cada equipo: el costo de ventas se estima aplicando el margen que
            declaró gerencia. Sirve para comparar meses y decidir sobre publicidad, no como cifra contable.
          </p>
        </SeccionPanel>

        {roasEquilibrio && (
          <SeccionPanel titulo="¿La publicidad se paga sola?">
            <p className="text-sm text-foreground">
              Con un margen del <b>{margen_pct}%</b>, cada dólar vendido deja <b>{(margen_pct / 100).toFixed(2)}</b> de
              utilidad bruta. Para que la publicidad se pague a sí misma hace falta un ROAS de:
            </p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums text-primary">{roasEquilibrio.toFixed(1)}×</p>
            <p className="mt-1 text-xs text-muted-foreground">ventas ÷ inversión publicitaria, solo para no perder</p>
            {roasActual !== null && (
              <div
                className={
                  "mt-3 rounded-lg border p-3 text-xs " +
                  (roasActual >= roasEquilibrio ? "border-[#1E7F4F]/30 bg-[#1E7F4F]/5" : "border-destructive/30 bg-destructive/5")
                }
              >
                <p className="font-semibold text-foreground">
                  ROAS del período: {roasActual.toFixed(1)}×{" "}
                  {roasActual >= roasEquilibrio ? "— por encima del equilibrio" : "— por debajo del equilibrio"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {roasActual >= roasEquilibrio
                    ? "Cada sol invertido en publicidad devuelve más utilidad de la que cuesta."
                    : `Cada US$ 1 invertido genera ${usd(roasActual)} de venta, que al margen actual son ${usd(roasActual * (margen_pct / 100))} de utilidad: se pierde ${usd(1 - roasActual * (margen_pct / 100))} por dólar.`}
                </p>
              </div>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              El cálculo supone que la venta atribuida a publicidad no habría ocurrido sin ella y que el cliente compra
              una sola vez. Si un cliente traído por anuncios vuelve a comprar, el retorno real es mayor a largo plazo.
            </p>
          </SeccionPanel>
        )}
      </div>

      <SeccionPanel titulo="Evolución mes a mes">
        <TablaMesesFinanzas meses={f.meses} />
        <p className="mt-3 text-[11px] text-muted-foreground">
          La columna <b className="text-foreground">Var.</b> compara las ventas con el mes anterior (análisis
          horizontal). En el estado de resultados de arriba, la columna <b className="text-foreground">% de ventas</b>{" "}
          hace el análisis vertical del período.
        </p>
      </SeccionPanel>

      <div className="grid gap-3 lg:grid-cols-2">
        <SeccionPanel titulo="¿Publicidad o relación con el cliente?">
          <div className="space-y-2">
            {ORDEN_GRUPOS.map((g) => {
              const d = atribucion.por_grupo[g];
              if (!d) return null;
              const p = totalAtrib > 0 ? (d.monto_usd / totalAtrib) * 100 : 0;
              return (
                <div key={g} className="grid grid-cols-[150px_1fr_auto] items-center gap-3 text-xs" title={AYUDA_GRUPO[g]}>
                  <span className="truncate text-foreground">{ETIQUETA_GRUPO[g]}</span>
                  <div className="h-5 overflow-hidden rounded-md bg-secondary">
                    <div className={`h-full rounded-md ${COLOR_GRUPO[g]}`} style={{ width: `${Math.max(p, d.monto_usd > 0 ? 2 : 0)}%` }} />
                  </div>
                  <span className="w-32 text-right tabular-nums text-muted-foreground">
                    <b className="text-foreground">{usd(d.monto_usd)}</b> · {d.n}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-2.5">
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-700" />
              <span>
                <b className="text-foreground">Esta comparación todavía no se puede leer al pie de la letra.</b> La
                mayor parte del monto cae en &ldquo;sin atribución clara&rdquo;: Central marca casi todo como
                &ldquo;página web&rdquo;, que era el valor por defecto de la hoja histórica y mezcla orgánico con
                publicidad. Para separarlos hace falta capturar el origen en el formulario web y preguntar
                &ldquo;¿cómo nos encontró?&rdquo; al registrar el contacto.
              </span>
            </p>
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-primary">Ver el detalle por vía</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {atribucion.por_via.map((v) => (
                <li key={v.via} className="flex items-center justify-between gap-2 border-b border-border py-1 last:border-0">
                  <span className="text-foreground">{v.via}</span>
                  <span className="tabular-nums text-muted-foreground">
                    <b className="text-foreground">{usd(v.monto_usd)}</b> · {v.n}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </SeccionPanel>

        <SeccionPanel titulo="Clientes nuevos frente a recurrentes">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Ya compraban antes</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-primary">{pctRecurrentes}%</p>
              <p className="text-[10px] text-muted-foreground">
                {usd(rec.recurrentes_usd)} · {rec.n_recurrentes} cliente{rec.n_recurrentes === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Compraron por primera vez</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{100 - pctRecurrentes}%</p>
              <p className="text-[10px] text-muted-foreground">
                {usd(rec.nuevos_usd)} · {rec.n_nuevos} cliente{rec.n_nuevos === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Recurrente = ya tenía una compra registrada antes del{" "}
            {fechaCalendarioLarga(periodo.desde)}. Si el negocio se apoya sobre todo en clientes nuevos, sostener las
            ventas obliga a captar cada mes; si se apoya en recurrentes, el esfuerzo rinde más en retener.
          </p>
        </SeccionPanel>
      </div>

      <SeccionPanel titulo="Valor de vida del cliente (CLTV) — concentración">
        <ParetoCltv cltv={f.cltv} />
      </SeccionPanel>

      {f.top_clientes.length > 0 && (
        <SeccionPanel titulo="Clientes de mayor valor histórico">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 pl-2 text-right font-medium">Compras</th>
                  <th className="pb-2 pl-2 text-right font-medium">Total histórico</th>
                  <th className="pb-2 pl-2 text-right font-medium">% del ingreso</th>
                </tr>
              </thead>
              <tbody>
                {f.top_clientes.map((c) => (
                  <tr key={c.cuenta_id} className="border-b border-border last:border-0 hover:bg-accent">
                    <td className="py-2">
                      <Link href={`/gerencia/clientes/${c.cuenta_id}`} className="text-foreground hover:underline">
                        {c.razon_social}
                      </Link>
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums">{c.compras}</td>
                    <td className="py-2 pl-2 text-right font-semibold tabular-nums text-foreground">{usd(c.total_usd)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">
                      {((c.total_usd / (f.cltv.total_usd || 1)) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SeccionPanel>
      )}
    </div>
  );
}
