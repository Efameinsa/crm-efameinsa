import { createClient } from "@/lib/supabase/server";
import { listarClientes, type OrdenClientes } from "@/lib/reportes";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { TablaClientes } from "@/components/crm/tabla-clientes";
import { EsperaDeNavegacion } from "@/components/crm/espera-de-navegacion";
import { FiltrosClientes, Paginacion } from "@/components/crm/filtros-clientes";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;
const ORDENES: OrdenClientes[] = ["recientes", "nombre", "ultima_venta", "valor"];

/**
 * La cartera entera, para Central.
 *
 * Santos, 10-09: «Central debería poder ver toda la cartera como lo tiene
 * gerencia». Hasta hoy Central solo veía al cliente por el hueco de la
 * bandeja —de quién es la ficha y cuándo se tocó— y, si quería más, tenía que
 * pedirle a alguien que abriera «Clientes» por ella. El desplegable de la
 * historia (10-09) le dio lo mínimo para decidir; esto le da todo lo demás:
 * buscar a cualquiera, ver quién lo tiene, qué compró y cuándo.
 *
 * Es la MISMA lista de gerencia —misma consulta (`listar_clientes`, que ya
 * dejaba pasar al rol central desde la 0021), misma tabla, mismos filtros— con
 * las filas apuntando a /central/clientes/[id], que es la ficha en modo
 * lectura. No se duplicó ninguna pieza: si mañana gerencia gana un filtro,
 * Central lo gana también.
 */
export default async function ClientesCentralPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; comercial?: string; con_venta?: string; sin_doc?: string; orden?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const comercialId = sp.comercial || null;
  const conVenta = sp.con_venta === "1";
  const sinDoc = sp.sin_doc === "1";
  const orden: OrdenClientes = ORDENES.includes(sp.orden as OrdenClientes) ? (sp.orden as OrdenClientes) : "recientes";
  const pagina = Math.max(1, parseInt(sp.pagina ?? "1", 10) || 1);

  const supabase = await createClient();
  const [{ data: comerciales }, { total, filas }] = await Promise.all([
    supabase
      .from("perfiles")
      .select("id, nombre")
      .eq("rol", "comercial")
      .eq("activo", true)
      .eq("es_prueba", false)
      .eq("es_soporte", false)
      .order("codigo_comercial"),
    listarClientes(supabase, {
      q,
      comercialId,
      soloConVenta: conVenta,
      soloSinDoc: sinDoc,
      orden,
      limite: POR_PAGINA,
      offset: (pagina - 1) * POR_PAGINA,
    }),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const desde = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const hasta = Math.min(total, pagina * POR_PAGINA);

  const titulo = q
    ? `Resultados para “${q}”`
    : sinDoc
      ? "Clientes sin RUC/DNI"
      : conVenta
        ? "Clientes con compras"
        : "Clientes";

  return (
    <div className="space-y-4">
      <FiltrosClientes q={q} comercialId={comercialId} conVenta={conVenta} sinDoc={sinDoc} orden={orden} comerciales={comerciales ?? []} />

      <SeccionPanel
        titulo={`${titulo} — ${total.toLocaleString("es-PE")}`}
        accion={<Paginacion pagina={pagina} totalPaginas={totalPaginas} total={total} desde={desde} hasta={hasta} />}
      >
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {q || conVenta || sinDoc || comercialId ? "Nada coincide con esos filtros." : "Todavía no hay clientes registrados."}
          </p>
        ) : (
          <EsperaDeNavegacion>
            <TablaClientes filas={filas} baseHref="/central/clientes" />
            <div className="mt-4 border-t border-border pt-3">
              <Paginacion pagina={pagina} totalPaginas={totalPaginas} total={total} desde={desde} hasta={hasta} />
            </div>
          </EsperaDeNavegacion>
        )}
      </SeccionPanel>
    </div>
  );
}
