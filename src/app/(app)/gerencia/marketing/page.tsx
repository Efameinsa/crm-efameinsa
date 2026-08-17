import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cargarResumenMarketing } from "@/lib/marketing";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Kpi } from "@/components/crm/kpi";
import { GraficoGasto } from "@/components/crm/grafico-gasto";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const ETIQUETA_PLATAFORMA: Record<string, string> = { google: "Google Ads", meta: "Meta Ads" };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; plataforma?: string }>;
}) {
  const sp = await searchParams;
  const hoy = new Date();
  const inicioMesDefault = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const hoyIso = iso(hoy);
  const inicioAnio = iso(new Date(hoy.getFullYear(), 0, 1));
  const hace30 = iso(new Date(hoy.getTime() - 29 * 86_400_000));

  const desde = sp.desde || inicioMesDefault;
  const hasta = sp.hasta || hoyIso;
  const plataforma: "google" | "meta" | undefined =
    sp.plataforma === "google" || sp.plataforma === "meta" ? sp.plataforma : undefined;

  const supabase = await createClient();
  const resumen = await cargarResumenMarketing(supabase, { desde, hasta, plataforma });

  function hrefPreset(d: string, h: string): string {
    const params = new URLSearchParams({ desde: d, hasta: h });
    if (plataforma) params.set("plataforma", plataforma);
    return `/gerencia/marketing?${params.toString()}`;
  }
  function hrefPlataforma(p?: "google" | "meta"): string {
    const params = new URLSearchParams({ desde, hasta });
    if (p) params.set("plataforma", p);
    return `/gerencia/marketing?${params.toString()}`;
  }
  const presetActivo = (d: string, h: string) => desde === d && hasta === h;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <ChipLink href={hrefPreset(inicioMesDefault, hoyIso)} activo={presetActivo(inicioMesDefault, hoyIso)}>
            Este mes
          </ChipLink>
          <ChipLink href={hrefPreset(hace30, hoyIso)} activo={presetActivo(hace30, hoyIso)}>
            Últimos 30 días
          </ChipLink>
          <ChipLink href={hrefPreset(inicioAnio, hoyIso)} activo={presetActivo(inicioAnio, hoyIso)}>
            Este año
          </ChipLink>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <ChipSegmento href={hrefPlataforma()} activo={!plataforma}>
              Todos
            </ChipSegmento>
            <ChipSegmento href={hrefPlataforma("google")} activo={plataforma === "google"}>
              Google
            </ChipSegmento>
            <ChipSegmento href={hrefPlataforma("meta")} activo={plataforma === "meta"}>
              Meta
            </ChipSegmento>
          </div>
          <form className="flex items-center gap-1.5" action="/gerencia/marketing">
            {plataforma && <input type="hidden" name="plataforma" value={plataforma} />}
            <input
              type="date"
              name="desde"
              defaultValue={desde}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
            />
            <span className="text-xs text-muted-foreground">a</span>
            <input
              type="date"
              name="hasta"
              defaultValue={hasta}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
            />
            <button
              type="submit"
              className="h-8 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
            >
              Ir
            </button>
          </form>
        </div>
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        Mostrando datos del{" "}
        <span className="font-medium text-foreground">
          {new Date(`${desde}T00:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}
        </span>{" "}
        al{" "}
        <span className="font-medium text-foreground">
          {new Date(`${hasta}T00:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}
        </span>
        {resumen.filas.length > 0 && (
          <>
            {" "}
            — {resumen.filas.length} registro{resumen.filas.length === 1 ? "" : "s"} de gasto en ese rango
          </>
        )}
      </p>

      {resumen.totalesPorMoneda.length === 0 ? (
        <SeccionPanel titulo="Sin datos todavía">
          <p className="text-sm text-muted-foreground">
            No hay gasto de campañas registrado en este período. Si recién conectaste Google Ads o Meta Ads, espera a
            la próxima sincronización diaria o corre el respaldo histórico desde Make.
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
                etiqueta="Leads reportados"
                valor={t.leadsReportados}
                sub={t.leadsReportados > 0 ? `CPL ${t.moneda} ${t.cpl.toFixed(2)}` : "sin conversiones"}
              />
            </div>
          </div>
        ))
      )}

      <SeccionPanel titulo={`Gasto por ${resumen.granularidad === "dia" ? "día" : "mes"}`}>
        <GraficoGasto serie={resumen.serie} moneda={resumen.totalesPorMoneda[0]?.moneda ?? "USD"} />
      </SeccionPanel>

      {resumen.porCampania.length > 0 && (
        <SeccionPanel titulo="Por campaña">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaña</TableHead>
                  <TableHead>Plataforma</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Impresiones</TableHead>
                  <TableHead className="text-right">Clics</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">CPL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumen.porCampania.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[260px] whitespace-normal">
                      <p className="line-clamp-2 font-medium text-foreground">{c.nombre}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {ETIQUETA_PLATAFORMA[c.plataforma] ?? c.plataforma}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {c.moneda} {c.gasto.toLocaleString("es-PE", { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {c.impresiones.toLocaleString("es-PE")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {c.clics.toLocaleString("es-PE")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{c.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{c.leadsReportados}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {c.leadsReportados > 0 ? `${c.moneda} ${c.cpl.toFixed(2)}` : "—"}
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

function ChipLink({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        activo ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}

function ChipSegmento({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        activo ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}
