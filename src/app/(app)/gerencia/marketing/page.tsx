import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/periodo";
import { fechaCalendarioLarga } from "@/lib/fechas";
import { ETIQUETA_VIA } from "@/lib/reportes";
import { FiltroPeriodo } from "@/components/crm/filtro-periodo";
import { ChipsParam } from "@/components/crm/chips-param";
import { TipoCambioInline } from "@/components/crm/tipo-cambio-inline";
import { cargarResumenMarketing, cargarEmbudoReal } from "@/lib/marketing";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Kpi } from "@/components/crm/kpi";
import { GraficoGasto } from "@/components/crm/grafico-gasto";
import { EmbudoReal } from "@/components/crm/embudo-real";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Todo el panel depende de searchParams (rango de fechas y plataforma) y de
// datos que cambian con cada sincronización: nunca debe servirse desde caché,
// o los filtros muestran los números del filtro anterior.
export const dynamic = "force-dynamic";

const ETIQUETA_PLATAFORMA: Record<string, string> = { google: "Google Ads", meta: "Meta Ads" };

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; plataforma?: string }>;
}) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp, "mes");
  const { desde, hasta } = periodo;
  const plataforma: "google" | "meta" | undefined =
    sp.plataforma === "google" || sp.plataforma === "meta" ? sp.plataforma : undefined;

  const supabase = await createClient();
  const [resumen, { data: leadsPeriodo }] = await Promise.all([
    cargarResumenMarketing(supabase, { desde, hasta, plataforma }),
    supabase
      .from("leads")
      .select("fuente, canal, estado")
      .gte("recibido_at", `${desde}T00:00:00`)
      .lte("recibido_at", `${hasta}T23:59:59`),
  ]);
  const embudo = await cargarEmbudoReal(supabase, resumen, { desde, hasta });

  // Leads del período por origen (lo que declara el propio lead, no la
  // plataforma): sirve para ver cuánto del flujo entrante es publicidad.
  const porOrigen = new Map<string, { n: number; asignados: number; descartados: number }>();
  for (const l of leadsPeriodo ?? []) {
    const clave = l.fuente === "google_ads" || l.fuente === "meta_ads" ? l.fuente : `contacto_${l.canal}`;
    const a = porOrigen.get(clave) ?? { n: 0, asignados: 0, descartados: 0 };
    a.n++;
    if (l.estado === "asignado") a.asignados++;
    if (l.estado === "descartado") a.descartados++;
    porOrigen.set(clave, a);
  }
  const origenes = Array.from(porOrigen.entries()).sort((a, b) => b[1].n - a[1].n);
  const totalLeads = origenes.reduce((s, [, v]) => s + v.n, 0);

  return (
    <div className="space-y-4">
      <FiltroPeriodo
        {...periodo}
        presetActivo={periodo.preset}
        presets={["mes", "mes_anterior", "30d", "90d", "anio", "12m"]}
        extra={
          <ChipsParam
            nombre="plataforma"
            valor={plataforma ?? null}
            opciones={[
              { valor: null, etiqueta: "Todas" },
              { valor: "google", etiqueta: "Google" },
              { valor: "meta", etiqueta: "Meta" },
            ]}
          />
        }
      />

      <p className="px-1 text-xs text-muted-foreground">
        Del <span className="font-medium text-foreground">{fechaCalendarioLarga(desde)}</span> al{" "}
        <span className="font-medium text-foreground">{fechaCalendarioLarga(hasta)}</span>
        {resumen.filas.length > 0 && (
          <>
            {" "}
            — {resumen.filas.length} registro{resumen.filas.length === 1 ? "" : "s"} de gasto en ese rango
          </>
        )}
        {" "}· ventas convertidas al <TipoCambioInline valor={embudo.tcUsdPen} editable /> para ROAS y costo por venta
      </p>

      {resumen.totalesPorMoneda.length === 0 ? (
        <SeccionPanel titulo="Sin datos todavía">
          <p className="text-sm text-muted-foreground">
            No hay gasto de campañas registrado en este período. Meta Ads se sincroniza solo cada mañana; Google Ads llega
            desde Make.com. Si el período es reciente, espere a la próxima sincronización.
          </p>
        </SeccionPanel>
      ) : (
        resumen.totalesPorMoneda.map((t) => (
          <div key={t.moneda} className="space-y-2">
            {resumen.totalesPorMoneda.length > 1 && (
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Moneda: {t.moneda}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi etiqueta="Gasto total" valor={Math.round(t.gasto)} prefijo={`${t.moneda} `} />
              <Kpi etiqueta="Impresiones" valor={t.impresiones} />
              <Kpi etiqueta="Clics" valor={t.clics} sub={`CTR ${t.ctr.toFixed(2)}%`} />
              <Kpi
                etiqueta="Conversiones (plataforma)"
                valor={t.leadsReportados}
                sub="lo que declara Google/Meta: incluye llamadas, clics y mensajes"
              />
            </div>
          </div>
        ))
      )}

      {totalLeads > 0 && (
        <SeccionPanel titulo="Contactos entrantes por origen">
          <div className="space-y-2">
            {origenes.map(([clave, v]) => {
              const p = (v.n / totalLeads) * 100;
              return (
                <div key={clave} className="grid grid-cols-[150px_1fr_auto] items-center gap-3 text-xs">
                  <span className="truncate text-foreground" title={ETIQUETA_VIA[clave] ?? clave}>
                    {ETIQUETA_VIA[clave] ?? clave}
                  </span>
                  <div className="h-5 overflow-hidden rounded-md bg-secondary">
                    <div className="h-full rounded-md bg-primary/80" style={{ width: `${Math.max(p, 2)}%` }} />
                  </div>
                  <span className="w-40 text-right tabular-nums text-muted-foreground">
                    <b className="text-foreground">{v.n}</b> · {Math.round(p)}%
                    {v.asignados > 0 && <> · {v.asignados} asignado{v.asignados === 1 ? "" : "s"}</>}
                    {v.descartados > 0 && <> · {v.descartados} descartado{v.descartados === 1 ? "" : "s"}</>}
                  </span>
                </div>
              );
            })}
            <p className="pt-1 text-[11px] text-muted-foreground">
              {totalLeads} contacto{totalLeads === 1 ? "" : "s"} recibido{totalLeads === 1 ? "" : "s"} en el período según lo que registró el CRM (Central o
              webhook). Los que llegan por WhatsApp a la app del celular no pasan por aquí salvo que Central los registre.
            </p>
          </div>
        </SeccionPanel>
      )}

      {embudo.totales && (
        <SeccionPanel titulo="Embudo real — de la inversión a la venta">
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Lo que la publicidad produjo <span className="font-medium text-foreground">según el CRM</span>, no según
              lo que declara la plataforma. Cada venta se atribuye a la campaña que trajo al cliente, aunque haya
              cerrado meses después.
            </p>
            {embudo.cplNoComparable && embudo.desdeConLeads && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs font-semibold text-amber-700">Faltan datos de leads en parte de este período</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Solo se tienen leads desde el{" "}
                  <span className="font-medium text-foreground">
                    {new Date(`${embudo.desdeConLeads}T00:00:00`).toLocaleDateString("es-PE", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>{" "}
                  — Google borra los formularios a los 60 días y los anteriores no se pudieron recuperar. Los números
                  de abajo{" "}
                  <span className="font-medium text-foreground">ya están calculados solo con ese tramo medible</span>,
                  para que el costo por lead sea real y no salga inflado. En el gráfico de gasto, el período sin datos
                  aparece en gris.
                </p>
              </div>
            )}
            <EmbudoReal totales={embudo.totalesComparables ?? embudo.totales} soloTramoMedible={embudo.totalesComparables !== null} />
            {embudo.leadsSinCampania > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Nota: {embudo.leadsSinCampania} lead{embudo.leadsSinCampania === 1 ? "" : "s"} de campañas sin gasto
                registrado en este rango no {embudo.leadsSinCampania === 1 ? "está" : "están"} en el conteo de arriba.
              </p>
            )}
          </div>
        </SeccionPanel>
      )}

      <SeccionPanel titulo={`Gasto por ${resumen.granularidad === "dia" ? "día" : "mes"}`}>
        <GraficoGasto
          serie={resumen.serie}
          moneda={resumen.totalesPorMoneda[0]?.moneda ?? "USD"}
          desdeConLeads={embudo.cplNoComparable ? embudo.desdeConLeads : null}
        />
      </SeccionPanel>

      {embudo.porCampania.length > 0 && (
        <SeccionPanel titulo="Rendimiento por campaña">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaña</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Clics</TableHead>
                  <TableHead className="text-right" title="Conversiones que reporta Google (incluye llamadas y clics) / leads reales que entraron al CRM">
                    Leads
                  </TableHead>
                  <TableHead className="text-right">Oport.</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">CPL real</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {embudo.porCampania.map((c) => (
                  <TableRow key={c.campaignId || c.nombre}>
                    <TableCell className="max-w-[220px] whitespace-normal">
                      <p className="line-clamp-2 font-medium text-foreground" title={c.nombre}>
                        {c.nombre}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {ETIQUETA_PLATAFORMA[c.plataforma] ?? c.plataforma}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {c.moneda} {c.gasto.toLocaleString("es-PE", { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {c.clics.toLocaleString("es-PE")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      <span className="text-muted-foreground">{c.leadsReportados}</span>
                      <span className="text-muted-foreground/50"> / </span>
                      <span className="font-semibold text-foreground">{c.leadsCrm}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{c.oportunidades}</TableCell>
                    <TableCell
                      className={cn(
                        "whitespace-nowrap text-right font-semibold tabular-nums",
                        c.ventas > 0 ? "text-[#1E7F4F]" : "text-muted-foreground",
                      )}
                    >
                      {c.ventas}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {c.cplReal !== null ? `${c.moneda} ${c.cplReal.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "whitespace-nowrap text-right font-semibold tabular-nums",
                        c.roas !== null && c.roas >= 1 ? "text-[#1E7F4F]" : "text-muted-foreground",
                      )}
                    >
                      {c.roas !== null ? `${c.roas.toFixed(2)}×` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SeccionPanel>
      )}
    </div>
  );
}
