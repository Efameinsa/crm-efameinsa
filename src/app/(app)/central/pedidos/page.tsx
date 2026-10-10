import Link from "@/components/enlace";
import { FileText, Printer, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { bloquesPedido, estadoPago, etiquetaResponsable, type ServicioPostventa } from "@/lib/postventa";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import { UrgenciaFinanzasBoton } from "@/components/crm/urgencia-finanzas-boton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * SUS PEDIDOS (Santos, 24-09: «Central debería tener una opción en el
 * sidebar que diga: sus pedidos»).
 *
 * Los pedidos que Central generó y liberó, después de soltarlos: en qué paso
 * va cada uno, a quién le toca, cuántas series tiene, cómo va el pago, y a un
 * clic la hoja del pedido y el cierre. Los que todavía no libera siguen en
 * «Cierres de venta».
 */
/** Hace n días, en ISO (fuera del render: Date.now no es «puro»). */
function haceDias(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

const FILTROS = [
  { clave: "", etiqueta: "En curso" },
  { clave: "pago", etiqueta: "Esperan el pago" },
  { clave: "series", etiqueta: "Falta una serie" },
  { clave: "despacho", etiqueta: "Por despachar" },
  { clave: "cerrados", etiqueta: "Cerrados (60 días)" },
];

export default async function SusPedidosPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  await requerirPerfil();
  const { ver = "", q } = await searchParams;
  // EL BUSCADOR (buzón, Central 10-10: «encontrar rápido el pedido que se
  // realizó de tal cliente para imprimir algún documento»). Busca en TODOS los
  // pedidos liberados, también los cerrados hace más de 60 días: por cliente,
  // RUC, N.º de pedido, N.º de cierre o serie de una máquina. Comas y paréntesis
  // rompen el filtro .or() de PostgREST: se cambian por espacios.
  const busqueda = (q ?? "").replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
  const supabase = await createClient();
  const hace60 = haceDias(60);

  // Los espacios valen como comodín: «lima airport» encuentra «LIMA AIRPORT PARTNERS».
  const patron = `%${busqueda.replace(/ /g, "%")}%`;
  // Lo que coincide fuera del pedido mismo: el N.º o el RUC del cierre y la
  // serie de una máquina. Se juntan en ids para el mismo .or().
  let idsPorCierre: string[] = [];
  let idsPorSerie: string[] = [];
  if (busqueda) {
    const [{ data: cierresQ }, { data: seriesQ }] = await Promise.all([
      supabase.from("informes_cierre").select("id").or(`codigo.ilike.${patron},cliente_doc.ilike.${patron},cliente_nombre.ilike.${patron}`).limit(100),
      busqueda.length >= 4
        ? supabase.from("pedido_equipos").select("servicio_id").ilike("serie", patron).limit(100)
        : Promise.resolve({ data: [] }),
    ]);
    idsPorCierre = ((cierresQ ?? []) as { id: string }[]).map((c) => c.id);
    idsPorSerie = [...new Set(((seriesQ ?? []) as { servicio_id: string }[]).map((e) => e.servicio_id))];
  }
  const filtroBusqueda = [
    `cliente_texto.ilike.${patron}`,
    `numero_pedido_erp.ilike.${patron}`,
    ...(idsPorCierre.length ? [`informe_cierre_id.in.(${idsPorCierre.join(",")})`] : []),
    ...(idsPorSerie.length ? [`id.in.(${idsPorSerie.join(",")})`] : []),
  ].join(",");

  const hace90 = haceDias(90);
  const [{ data: pedidos }, { data: emitidos }, { data: liberados }] = await Promise.all([
    (busqueda
      ? supabase
          .from("servicios_postventa")
          .select("*")
          .not("informe_cierre_id", "is", null)
          .not("pedido_ejecutado_at", "is", null)
          .or(filtroBusqueda)
      : supabase
          .from("servicios_postventa")
          .select("*")
          .not("informe_cierre_id", "is", null)
          .not("pedido_ejecutado_at", "is", null)
          .or(`cerrado_at.is.null,cerrado_at.gte.${hace60}`)
    )
      .order("pedido_ejecutado_at", { ascending: false })
      .limit(300),
    // Lo que falta liberar (se hace en «Cierres de venta»): emitidos de los últimos 90 días sin pedido ejecutado.
    supabase.from("informes_cierre").select("id").is("anulado_at", null).not("emitido_at", "is", null).gte("created_at", hace90).limit(500),
    supabase.from("servicios_postventa").select("informe_cierre_id").not("pedido_ejecutado_at", "is", null).gte("created_at", hace90).limit(1000),
  ]);
  const yaLiberados = new Set(((liberados ?? []) as { informe_cierre_id: string | null }[]).map((x) => x.informe_cierre_id));
  const porLiberar = ((emitidos ?? []) as { id: string }[]).filter((x) => !yaLiberados.has(x.id)).length;
  const lista = (pedidos ?? []) as unknown as ServicioPostventa[];
  const ids = lista.map((p) => p.id);
  const informes = [...new Set(lista.map((p) => p.informe_cierre_id).filter(Boolean))] as string[];
  const [{ data: equipos }, { data: cierres }] = await Promise.all([
    ids.length ? supabase.from("pedido_equipos").select("servicio_id, serie").in("servicio_id", ids.slice(0, 150)) : Promise.resolve({ data: [] }),
    informes.length ? supabase.from("informes_cierre").select("id, codigo, serie").in("id", informes.slice(0, 150)) : Promise.resolve({ data: [] }),
  ]);
  const series = new Map<string, { con: number; total: number }>();
  for (const e of (equipos ?? []) as { servicio_id: string; serie: string | null }[]) {
    const x = series.get(e.servicio_id) ?? { con: 0, total: 0 };
    x.total++;
    if (e.serie) x.con++;
    series.set(e.servicio_id, x);
  }
  const cierre = new Map(((cierres ?? []) as { id: string; codigo: string; serie: string }[]).map((c) => [c.id, c]));

  const filas = lista.map((s) => {
    const pasos = bloquesPedido(s).flatMap((b) => b.pasos);
    const siguiente = pasos.find((p) => !p.hecho) ?? null;
    const sr = series.get(s.id) ?? { con: 0, total: 0 };
    return { s, siguiente, sr, pago: estadoPago(s), cerrado: Boolean(s.cerrado_at) };
  });
  const enCurso = filas.filter((f) => !f.cerrado);
  // Buscando, «En curso» pasa a «Todos»: el pedido que se busca para imprimir
  // muchas veces ya está cerrado.
  const conBusqueda = (f: (typeof filas)[number][]) => (busqueda ? filas : f);
  const visibles =
    ver === "cerrados"
      ? filas.filter((f) => f.cerrado)
      : ver === "pago"
        ? enCurso.filter((f) => f.pago !== "completo")
        : ver === "series"
          ? enCurso.filter((f) => f.sr.total > f.sr.con)
          : ver === "despacho"
            ? enCurso.filter((f) => !f.s.despachado_at)
            : conBusqueda(enCurso);
  const cuenta = (clave: string) =>
    clave === "cerrados"
      ? filas.filter((f) => f.cerrado).length
      : clave === "pago"
        ? enCurso.filter((f) => f.pago !== "completo").length
        : clave === "series"
          ? enCurso.filter((f) => f.sr.total > f.sr.con).length
          : clave === "despacho"
            ? enCurso.filter((f) => !f.s.despachado_at).length
            : conBusqueda(enCurso).length;
  const enlace = (clave: string) => {
    const p = new URLSearchParams({ ...(clave ? { ver: clave } : {}), ...(busqueda ? { q: busqueda } : {}) }).toString();
    return p ? `/central/pedidos?${p}` : "/central/pedidos";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Sus pedidos</h1>
          <p className="text-sm text-muted-foreground">Los pedidos que usted liberó: en qué paso va cada uno y a quién le toca.</p>
        </div>
        {porLiberar > 0 && (
          <Link href="/central/cierres" className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10">
            {porLiberar} por liberar en Cierres de venta →
          </Link>
        )}
      </div>

      <form className="flex gap-2" action="/central/pedidos">
        {ver && <input type="hidden" name="ver" value={ver} />}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={busqueda} placeholder="Buscar por cliente, RUC, N.º de pedido, N.º de cierre o serie" className="pl-8" />
        </div>
        <Button type="submit" size="sm">
          Buscar
        </Button>
        {busqueda && (
          <Link href={ver ? `/central/pedidos?ver=${ver}` : "/central/pedidos"} className="self-center text-xs font-medium text-muted-foreground hover:text-foreground">
            Limpiar
          </Link>
        )}
      </form>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <Link
            key={f.clave}
            href={enlace(f.clave)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              ver === f.clave ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-accent",
            )}
          >
            {busqueda && !f.clave ? "Todos" : f.etiqueta} <span className="opacity-70">{cuenta(f.clave)}</span>
          </Link>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {busqueda
            ? `Ningún pedido liberado coincide con «${busqueda}». Pruebe con parte del nombre, el RUC o el N.º del cierre (por ejemplo 012). Si el cierre todavía no se libera, está en Cierres de venta.`
            : ver ? "Ningún pedido en esta vista." : "Todavía no hay pedidos liberados en curso. Cuando libere uno desde Cierres de venta, aparece aquí."}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {visibles.map(({ s, siguiente, sr, pago, cerrado }) => {
            const c = s.informe_cierre_id ? cierre.get(s.informe_cierre_id) : undefined;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{(s.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "")}</p>
                  <p className="text-xs text-muted-foreground">
                    {c ? `Cierre ${c.serie === "OPEN" ? "Open" : "Efameinsa"} ${c.codigo}` : ""}
                    {s.numero_pedido_erp ? ` · Pedido ${s.numero_pedido_erp}` : ""}
                    {s.regularizado ? " · REG (regularizado)" : ""}
                    {s.pedido_ejecutado_at ? ` · liberado ${fechaHoraLima(s.pedido_ejecutado_at)}` : ""}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                    {sr.total > 0 && (
                      <span className={cn("rounded-full px-2 py-0.5 font-semibold", sr.con === sr.total ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-amber-100 text-amber-900")}>
                        {sr.con} de {sr.total} con serie
                      </span>
                    )}
                    <span className={cn("rounded-full px-2 py-0.5 font-semibold", pago === "completo" ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-secondary text-foreground")}>
                      {pago === "completo" ? "Pago confirmado" : pago === "parcial" ? "Pago parcial" : "Pago pendiente"}
                    </span>
                    {s.despachado_at && <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">Despachado</span>}
                    {s.urgencia_finanzas_at && !cerrado && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive" title={s.urgencia_finanzas_motivo ?? undefined}>
                        Urgencia a Finanzas {fechaHoraLima(s.urgencia_finanzas_at)}
                        {(s.urgencia_finanzas_n ?? 0) > 1 ? ` · ${s.urgencia_finanzas_n} avisos` : ""}
                      </span>
                    )}
                    {cerrado ? (
                      <span className="rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 font-semibold text-[#1E7F4F]">Cerrado</span>
                    ) : (
                      siguiente && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                          Sigue: {siguiente.etiqueta} · {etiquetaResponsable(siguiente.responsable)}
                        </span>
                      )
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {/* La sirena a Finanzas (0298): el cliente necesita la factura
                      o quiere despachar y el pago sigue sin confirmar. */}
                  {!cerrado && pago !== "completo" && (
                    <UrgenciaFinanzasBoton
                      servicioId={s.id}
                      cliente={(s.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "")}
                      totalUrgencias={s.urgencia_finanzas_n ?? 0}
                      ultimaAt={s.urgencia_finanzas_at ?? null}
                    />
                  )}
                  <a href={`/pedidos/${s.id}/imprimir`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
                    <Printer className="size-3.5" /> Pedido
                  </a>
                  {s.informe_cierre_id && (
                    <a href={`/api/informes/${s.informe_cierre_id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
                      <FileText className="size-3.5" /> Cierre
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
