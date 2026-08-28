import { createClient } from "@/lib/supabase/server";
import { listarClientes, type OrdenClientes } from "@/lib/reportes";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { TablaClientes } from "@/components/crm/tabla-clientes";
import { FiltrosClientes, Paginacion } from "@/components/crm/filtros-clientes";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;
const ORDENES: OrdenClientes[] = ["recientes", "nombre", "ultima_venta", "valor"];

// Lista de clientes de gerencia. Antes mostraba los 30 más recientes y nada
// más ("no se puede bajar más"): ahora pagina de a 50 sobre las 15 mil
// cuentas, con búsqueda, filtro por comercial/compras/documento y orden —
// todo resuelto en Postgres por listar_clientes() (migración 0021).
export default async function ClientesGerenciaPage({
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
    supabase.from("perfiles").select("id, nombre").eq("rol", "comercial").eq("activo", true).eq("es_prueba", false).eq("es_soporte", false).order("codigo_comercial"),
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
          <>
            <TablaClientes filas={filas} />
            <div className="mt-4 border-t border-border pt-3">
              <Paginacion pagina={pagina} totalPaginas={totalPaginas} total={total} desde={desde} hasta={hasta} />
            </div>
          </>
        )}
      </SeccionPanel>
    </div>
  );
}
