import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import {
  ahoraMs,
  consultaLiberables,
  LIBERABLES_POR_PAGINA,
  TOPE_REASIGNACION_EN_BLOQUE,
  type FilaLiberable,
} from "@/lib/cartera-liberable";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { EsperaDeNavegacion } from "@/components/crm/espera-de-navegacion";
import { Paginacion } from "@/components/crm/filtros-clientes";
import { FiltrosCarteraLiberable } from "@/components/crm/filtros-cartera-liberable";
import { TablaCarteraLiberable } from "@/components/crm/tabla-cartera-liberable";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * CARTERA LIBERABLE: EL REPARTO DE CADA TRES MESES.
 *
 * Gerencia, 23-09-2026: «Cartera: 3 meses sin venta para reasignar; se
 * redistribuye cada 3 meses» (antes eran seis). Hasta hoy esta pantalla era
 * una tabla muda —razón social y dos fechas, sin saber de quién era cada
 * cliente ni poder hacer nada con él— y traía las 13 mil filas de una vez.
 *
 * Ahora sirve para repartir: arriba cuántos clientes liberables tiene cada
 * comercial (y un clic filtra), abajo la lista paginada en la base, con el
 * dueño, cuánto va sin venta y el enlace a la ficha, ordenada por lo que más
 * tiempo lleva quieto. Se reasigna de a uno o en bloque; la decisión sigue
 * siendo de gerencia, cliente por cliente o tanda por tanda.
 */
export default async function CarteraLiberablePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; comercial?: string; con_venta?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const comercialId = sp.comercial && /^[0-9a-f-]{36}$/i.test(sp.comercial) ? sp.comercial : null;
  const soloConVenta = sp.con_venta === "1";
  const pagina = Math.max(1, parseInt(sp.pagina ?? "1", 10) || 1);
  const filtro = { comercialId, q, soloConVenta };

  const supabase = await createClient();

  // Los perfiles son pocos: se traen todos para poner nombre al dueño de
  // cada fila (también a los que ya no están activos) y armar el «Pasa a».
  const { data: perfiles } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial, rol, activo, es_prueba, es_soporte")
    .order("codigo_comercial", { nullsFirst: false });
  const todos = perfiles ?? [];
  const comercialesConCartera = todos.filter((p) => p.rol === "comercial");
  const destinos = todos
    .filter((p) => p.rol === "comercial" && p.activo && !p.es_prueba && !p.es_soporte)
    .map((p) => ({ id: p.id as string, nombre: p.nombre as string, codigo_comercial: p.codigo_comercial as string | null }));

  const desdeFila = (pagina - 1) * LIBERABLES_POR_PAGINA;
  const [lista, total, ...porComercial] = await Promise.all([
    consultaLiberables(
      supabase,
      filtro,
      "id, razon_social, num_doc, comercial_id, ultima_venta_at, cartera_desde, sin_venta_desde",
      { count: "exact" },
    ).range(desdeFila, desdeFila + LIBERABLES_POR_PAGINA - 1),
    supabase.from("v_cuentas_liberables").select("id", { count: "exact", head: true }),
    ...comercialesConCartera.map((c) =>
      supabase.from("v_cuentas_liberables").select("id", { count: "exact", head: true }).eq("comercial_id", c.id),
    ),
  ]);

  const filas = (lista.data ?? []) as unknown as FilaLiberable[];
  const totalFiltrado = lista.count ?? 0;
  const totalLiberables = total.count ?? 0;
  const resumen = comercialesConCartera
    .map((c, i) => ({
      id: c.id as string,
      codigo: (c.codigo_comercial as string | null) ?? "",
      nombre: c.nombre as string,
      activo: c.activo as boolean,
      n: porComercial[i]?.count ?? 0,
    }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  const otros = totalLiberables - resumen.reduce((s, r) => s + r.n, 0);

  const nombreDe = new Map(
    todos.map((p) => [p.id as string, { codigo: (p.codigo_comercial as string | null) ?? null, nombre: p.nombre as string }]),
  );
  const ahora = ahoraMs();

  const totalPaginas = Math.max(1, Math.ceil(totalFiltrado / LIBERABLES_POR_PAGINA));
  const desde = totalFiltrado === 0 ? 0 : desdeFila + 1;
  const hasta = Math.min(totalFiltrado, pagina * LIBERABLES_POR_PAGINA);
  const comercialFiltrado = comercialId ? nombreDe.get(comercialId) : null;

  const urlComercial = (id: string | null) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (soloConVenta) p.set("con_venta", "1");
    if (id) p.set("comercial", id);
    const s = p.toString();
    return `/gerencia/cartera-liberable${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <SeccionPanel titulo={`Cartera liberable — ${totalLiberables.toLocaleString("es-PE")} clientes`}>
        <p className="mb-3 text-sm text-muted-foreground">
          Clientes con <b className="text-foreground">tres meses o más sin venta</b> (decisión de gerencia del
          23-09-2026; antes eran seis). Se pueden pasar a otro comercial; quién se los queda lo decide gerencia. Al
          reasignarlos, el nuevo dueño tiene tres meses para venderles antes de que vuelvan a aparecer aquí.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={urlComercial(null)}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs transition-colors",
              !comercialId ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
            )}
          >
            <span className="block font-semibold">Todos</span>
            <span className="tabular-nums">{totalLiberables.toLocaleString("es-PE")}</span>
          </Link>
          {resumen.map((r) => (
            <Link
              key={r.id}
              href={urlComercial(r.id)}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs transition-colors",
                comercialId === r.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
              )}
            >
              <span className="block font-semibold">
                {r.codigo ? `${r.codigo} · ` : ""}
                {r.nombre}
                {!r.activo && <span className="font-normal text-muted-foreground"> (inactivo)</span>}
              </span>
              <span className="tabular-nums">{r.n.toLocaleString("es-PE")}</span>
            </Link>
          ))}
          {otros > 0 && (
            <span className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              <span className="block font-semibold">A nombre de otras cuentas</span>
              <span className="tabular-nums">{otros.toLocaleString("es-PE")}</span>
            </span>
          )}
        </div>
      </SeccionPanel>

      <FiltrosCarteraLiberable
        q={q}
        comercialId={comercialId}
        soloConVenta={soloConVenta}
        comerciales={resumen.map((r) => ({ id: r.id, nombre: r.codigo ? `${r.codigo} · ${r.nombre}` : r.nombre }))}
      />

      <SeccionPanel
        titulo={
          comercialFiltrado
            ? `De ${comercialFiltrado.codigo ?? ""} ${comercialFiltrado.nombre} — ${totalFiltrado.toLocaleString("es-PE")}`
            : `Más tiempo sin venta primero — ${totalFiltrado.toLocaleString("es-PE")}`
        }
        accion={
          <Paginacion
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={totalFiltrado}
            desde={desde}
            hasta={hasta}
          />
        }
      >
        {lista.error ? (
          <p className="text-sm text-destructive">
            No se pudo leer la lista. Recargue la página; si sigue igual, avise a sistemas.
          </p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {q || comercialId || soloConVenta
              ? "Ningún cliente liberable coincide con esos filtros. Pruebe quitando alguno."
              : "No hay clientes con tres meses sin venta: toda la cartera está al día."}
          </p>
        ) : (
          <EsperaDeNavegacion>
            <TablaCarteraLiberable
              // Cambiar de página o de filtro limpia lo marcado.
              key={`${q}|${comercialId}|${soloConVenta}|${pagina}`}
              filas={filas.map((f) => ({
                id: f.id,
                razonSocial: f.razon_social,
                numDoc: f.num_doc,
                comercialId: f.comercial_id,
                comercial: nombreDe.get(f.comercial_id) ?? null,
                ultimaVentaAt: f.ultima_venta_at,
                sinVentaDesde: f.sin_venta_desde,
              }))}
              ahora={ahora}
              destinos={destinos}
              filtro={filtro}
              comercialFiltrado={
                comercialId && comercialFiltrado
                  ? {
                      id: comercialId,
                      etiqueta: `${comercialFiltrado.codigo ?? ""} ${comercialFiltrado.nombre}`.trim(),
                      total: totalFiltrado,
                    }
                  : null
              }
              tope={TOPE_REASIGNACION_EN_BLOQUE}
            />
            <div className="mt-4 border-t border-border pt-3">
              <Paginacion pagina={pagina} totalPaginas={totalPaginas} total={totalFiltrado} desde={desde} hasta={hasta} />
            </div>
          </EsperaDeNavegacion>
        )}
      </SeccionPanel>
    </div>
  );
}
