import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/periodo";
import { fechaCalendarioLarga } from "@/lib/fechas";
import { ETIQUETA_VIA } from "@/lib/reportes";
import { FiltroPeriodo } from "@/components/crm/filtro-periodo";
import { ChipsParam } from "@/components/crm/chips-param";
import { TipoCambioInline } from "@/components/crm/tipo-cambio-inline";
import { cargarResumenMarketing, cargarEmbudoReal } from "@/lib/marketing";
import { cargarConversionesDeCampana, ETIQUETA_ESTADO_CONVERSION } from "@/lib/marketing-conversiones";
import { Download } from "lucide-react";
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
  // Leads por origen: agregado en Postgres (leads_por_origen, migración 0025)
  // — con ~39k leads históricos de Central, traer filas al servidor Next
  // truncaba en 1.000 sin avisar.
  const [resumen, { data: porOrigenData }] = await Promise.all([
    cargarResumenMarketing(supabase, { desde, hasta, plataforma }),
    supabase.rpc("leads_por_origen", { p_desde: desde, p_hasta: hasta }),
  ]);
  const [embudo, conversiones] = await Promise.all([
    cargarEmbudoReal(supabase, resumen, { desde, hasta }),
    cargarConversionesDeCampana(supabase, desde, hasta),
  ]);
  const porEstado = new Map<string, number>();
  for (const f of conversiones.filas) porEstado.set(f.estado, (porEstado.get(f.estado) ?? 0) + 1);
  const conGclid = conversiones.filas.filter((f) => (f.gclid || f.gbraid || f.wbraid) && ["calificado", "cotizado", "ganado"].includes(f.estado)).length;
  const deMeta = conversiones.filas.filter((f) => f.plataforma === "meta" && ["calificado", "cotizado", "ganado"].includes(f.estado)).length;
  const rango = `desde=${desde}&hasta=${hasta}`;

  const origenes = ((porOrigenData ?? []) as {
    clave: string;
    n: number;
    asignados: number;
    descartados: number;
    duplicados?: number;
  }[]).map(
    (o) => [o.clave, o] as const,
  );
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
                    {/* Repetidos: el contacto llegó y costó plata, pero ya
                        estaba registrado. Ni asignado ni descartado — sin esta
                        línea la diferencia quedaba sin explicación. */}
                    {(v.duplicados ?? 0) > 0 && <> · {v.duplicados} repetido{v.duplicados === 1 ? "" : "s"}</>}
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
            <EmbudoReal
              totales={embudo.totalesComparables ?? embudo.totales}
              soloTramoMedible={embudo.totalesComparables !== null}
              hrefDetalle={`/gerencia/marketing/leads?desde=${desde}&hasta=${hasta}${plataforma ? `&plataforma=${plataforma}` : ""}`}
            />
            {embudo.leadsSinCampania > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Nota: {embudo.leadsSinCampania} lead{embudo.leadsSinCampania === 1 ? "" : "s"} de campañas sin gasto
                registrado en este rango no {embudo.leadsSinCampania === 1 ? "está" : "están"} en el conteo de arriba.
              </p>
            )}
          </div>
        </SeccionPanel>
      )}

      {/* LA VUELTA A LAS PLATAFORMAS (Santos, 11-09). Google y Meta solo
          saben quién llenó el formulario; el CRM sabe quién se calificó,
          cotizó o compró. Subirles eso como «conversiones offline» hace que
          la campaña optimice hacia el cliente bueno. */}
      {conversiones.filas.length > 0 && (
        <SeccionPanel titulo="Retroalimentar a Google Ads y Meta">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {conversiones.filas.length} contacto{conversiones.filas.length === 1 ? "" : "s"} de campaña en el período, con lo que
              pasó después en el CRM. Se sube a cada plataforma como conversiones offline, para que aprenda a traer
              clientes que compran y no solo formularios.
            </p>
            <div className="flex flex-wrap gap-2">
              {(["nuevo", "repetido", "descartado", "calificado", "cotizado", "ganado"] as const).map((e) => (
                <span key={e} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                  <b className="text-foreground">{porEstado.get(e) ?? 0}</b>{" "}
                  <span className="text-muted-foreground">{ETIQUETA_ESTADO_CONVERSION[e].toLowerCase()}</span>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/marketing/conversiones?formato=google&${rango}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
              >
                <Download className="size-3.5" /> CSV para Google Ads ({conGclid})
              </a>
              <a
                href={`/api/marketing/conversiones?formato=meta&${rango}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
              >
                <Download className="size-3.5" /> CSV para Meta ({deMeta})
              </a>
              <a
                href={`/api/marketing/conversiones?formato=todo&${rango}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary"
              >
                <Download className="size-3.5" /> Todo el detalle
              </a>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Google: Objetivos → Conversiones → Cargas → subir el CSV (trae el Google Click ID, el nombre de la
              conversión —Lead calificado, Cotizado, Venta—, la hora y el importe de la venta); antes hay que crear esas
              tres conversiones «importadas desde clics» en la cuenta. Meta: Administrador de eventos → Conjunto de
              eventos offline → Cargar; el CSV lleva correo y teléfono sin cifrar y Meta los cifra al subirlos. Solo
              cuentan los calificados, cotizados y ganados: descartados y repetidos no se reportan.
            </p>
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
                      {c.ventas > 0 ? (
                        <Link
                          href={`/gerencia/marketing/leads?desde=${desde}&hasta=${hasta}&campania=${encodeURIComponent(c.campaignId)}&filtro=ventas`}
                          className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
                          title="Ver estas ventas"
                        >
                          {c.ventas}
                        </Link>
                      ) : (
                        c.ventas
                      )}
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
