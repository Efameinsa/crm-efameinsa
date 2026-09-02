import { Search } from "lucide-react";
import { listarClientes, type OrdenClientes } from "@/lib/reportes";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { FiltroRubro } from "@/components/crm/filtro-rubro";
import { alcanceDe, cargarOpcionesRubro, leerFiltroRubro, rubroParaRpc } from "../consultas-rubro";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { TablaCartera } from "@/components/crm/tabla-cartera";
import { Paginacion } from "@/components/crm/filtros-clientes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;
const ORDENES: OrdenClientes[] = ["recientes", "nombre", "ultima_venta", "valor"];

const ETIQUETA_ORDEN: Record<OrdenClientes, string> = {
  recientes: "Más recientes",
  nombre: "Nombre",
  ultima_venta: "Última compra",
  valor: "Lo que compró",
};

// Mi cartera.
//
// ⚠️ ESTA PANTALLA MENTÍA. Traía las cuentas con un select directo y sin
// paginar, y Supabase corta en 1.000 filas por consulta SIN avisar: Katerine
// tiene 8.775 clientes y la pantalla decía "1.000 clientes" — 7.775 invisibles
// y un contador falso. Un tope redondo en una lista es siempre sospechoso.
//
// Ahora usa la misma función paginada que la lista de gerencia
// (`listar_clientes`, migración 0021), que además devuelve el total exacto y
// resuelve la búsqueda en Postgres. Esa función ya fuerza `p_comercial =
// auth.uid()` cuando quien pregunta es un comercial, así que nadie ve cartera
// ajena aunque manipule la URL.
//
// El orden por defecto es "más recientes" y no alfabético: con 8.775 clientes,
// empezar por la A no le sirve a nadie.
export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; orden?: string; pagina?: string; rubro?: string }>;
}) {
  const perfil = await requerirPerfil();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const orden: OrdenClientes = ORDENES.includes(sp.orden as OrdenClientes) ? (sp.orden as OrdenClientes) : "recientes";
  const pagina = Math.max(1, parseInt(sp.pagina ?? "1", 10) || 1);
  // Rubro (Carlos, 01-09: «hoy me voy a centrar en mineras»): lo filtra
  // listar_clientes() desde la 0152, con la misma búsqueda y los mismos órdenes.
  const rubro = leerFiltroRubro(sp.rubro);

  const supabase = await createClient();
  const [{ opciones: opcionesRubro, sinRubro }, { total, filas }] = await Promise.all([
    cargarOpcionesRubro(supabase, alcanceDe(perfil)),
    listarClientes(supabase, { q, orden, rubro: rubroParaRpc(rubro), limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const desde = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const hasta = Math.min(total, pagina * POR_PAGINA);

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" action="/comercial/cartera">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, RUC/DNI o teléfono…"
            className="pl-9"
          />
        </div>
        {/* El orden viaja en la URL para que la página sea compartible y el
            botón Atrás del navegador funcione. */}
        <select
          name="orden"
          defaultValue={orden}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          aria-label="Ordenar por"
        >
          {ORDENES.map((o) => (
            <option key={o} value={o}>
              {ETIQUETA_ORDEN[o]}
            </option>
          ))}
        </select>
        {/* Sin onCambiar: es un campo más del formulario y lo envía solo al
            cambiar, con la búsqueda y el orden que ya estén puestos. */}
        <FiltroRubro valor={rubro} opciones={opcionesRubro} sinRubro={sinRubro} className="[&>select]:h-9 [&>select]:text-sm" />
        <Button type="submit">Buscar</Button>
      </form>

      <SeccionPanel
        titulo={q ? `Resultados para “${q}”` : "Mi cartera"}
        accion={
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
            {total.toLocaleString("es-PE")} cliente{total === 1 ? "" : "s"}
          </span>
        }
      >
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {rubro === "sin"
              ? "Todos sus clientes ya tienen rubro."
              : q || rubro !== null
                ? "Sin resultados para esa búsqueda."
                : "Todavía no tiene clientes en su cartera."}
          </p>
        ) : (
          <div className="space-y-3">
            <TablaCartera
              filas={filas.map((c) => ({
                id: c.id,
                razonSocial: c.razon_social,
                documento: c.tipo_doc !== "SIN_DOC" && c.num_doc ? `${c.tipo_doc}: ${c.num_doc}` : "—",
                distrito: c.distrito ?? c.departamento,
                compras: c.n_ventas,
                totalUsd: c.total_usd,
                oportunidadesActivas: c.abiertas,
                ultimaVentaAt: c.ultima_venta_at,
                conServidor: c.con_servidor,
                historicaId: c.historica_id,
              }))}
            />
            <Paginacion pagina={pagina} totalPaginas={totalPaginas} total={total} desde={desde} hasta={hasta} />
          </div>
        )}
      </SeccionPanel>
    </div>
  );
}
