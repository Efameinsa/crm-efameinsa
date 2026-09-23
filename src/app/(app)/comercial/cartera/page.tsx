import { listarClientes, type OrdenClientes } from "@/lib/reportes";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { FiltroRubro } from "@/components/crm/filtro-rubro";
import { alcanceDe, cargarOpcionesRubro, leerFiltroRubro, rubroParaRpc } from "../consultas-rubro";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { TablaCartera } from "@/components/crm/tabla-cartera";
import { PestanasClientes } from "@/components/crm/pestanas-clientes";
import { Paginacion } from "@/components/crm/filtros-clientes";
import { Button } from "@/components/ui/button";
import { BusquedaEnVivo } from "@/components/crm/busqueda-en-vivo";
import { EsperaDeNavegacion } from "@/components/crm/espera-de-navegacion";
import { FiltroSeguimiento } from "@/components/crm/filtro-seguimiento";
import { ETIQUETA_SEGUIMIENTO, leerSeguimiento, parametrosSeguimiento } from "@/lib/seguimiento-cartera";

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
  searchParams: Promise<{ q?: string; orden?: string; pagina?: string; rubro?: string; seg?: string }>;
}) {
  const perfil = await requerirPerfil();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const orden: OrdenClientes = ORDENES.includes(sp.orden as OrdenClientes) ? (sp.orden as OrdenClientes) : "recientes";
  const pagina = Math.max(1, parseInt(sp.pagina ?? "1", 10) || 1);
  // Rubro (Carlos, 01-09: «hoy me voy a centrar en mineras»): lo filtra
  // listar_clientes() desde la 0152, con la misma búsqueda y los mismos órdenes.
  const rubro = leerFiltroRubro(sp.rubro);
  // Para postventa esta lista ya no es «lo mío» sino «lo que atiendo»
  // (migración 0183): 480 clientes, de los cuales más de 400 están en la
  // cartera de otro comercial. Se dice en el título y se muestra de quién es
  // cada uno, porque lo contrario se lee como un traspaso de cartera.
  const atiendeSinPoseer = Boolean(perfil.es_postventa);
  // SEGUIMIENTO DE CARTERA (23-09, 0281). Ariana (C4): «¿cómo voy a gestionar
  // si se le llamó o no?». Clientes con o sin llamada, WhatsApp, visita… hoy,
  // en la semana o en 30 días; lo cuenta la base sobre toda la cartera.
  const seguimiento = leerSeguimiento(sp.seg);

  const supabase = await createClient();
  const [{ opciones: opcionesRubro, sinRubro }, { total, filas }] = await Promise.all([
    cargarOpcionesRubro(supabase, alcanceDe(perfil)),
    listarClientes(supabase, {
      q,
      orden,
      rubro: rubroParaRpc(rubro),
      ...parametrosSeguimiento(seguimiento),
      limite: POR_PAGINA,
      offset: (pagina - 1) * POR_PAGINA,
    }),
  ]);

  // LA ÚLTIMA GESTIÓN DE CADA CLIENTE DE LA PÁGINA (19-09). Ariana: «ya lo
  // gestionaron y sigue apareciendo como Retomar». Cuando el seguimiento del
  // día se cierra (el cliente dijo que no), el cliente queda sin nada abierto y
  // la fila ofrece «Retomar» — correcto, pero parecía que la llamada no se
  // había registrado. Ahora la fila dice «Gestionado hoy · llamada».
  const ultimaGestion = await ultimasGestionesDe(supabase, filas.map((c) => c.id));
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const desde = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const hasta = Math.min(total, pagina * POR_PAGINA);

  return (
    <div className="space-y-4">
      {/* Postventa entra acá por el nombre del cliente y a «Máquinas
          instaladas» por la serie, según lo que le hayan dicho por teléfono.
          Desde el 08-09 son una sola entrada del menú con dos pestañas. */}
      {atiendeSinPoseer && <PestanasClientes activa="clientes" clientes={total} />}

      <form className="flex flex-wrap gap-2" action="/comercial/cartera">
        {/* Busca mientras se escribe (11-09); Enter y «Buscar» siguen
            funcionando porque el campo sigue dentro del formulario GET. */}
        <BusquedaEnVivo inicial={q} placeholder="Buscar por nombre, RUC/DNI o teléfono…" />
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
        <FiltroSeguimiento valor={seguimiento} className="[&>select]:h-9 [&>select]:text-sm" />
        <Button type="submit">Buscar</Button>
      </form>

      <SeccionPanel
        titulo={
          q
            ? `Resultados para “${q}”`
            : seguimiento
              ? `Mi cartera · ${ETIQUETA_SEGUIMIENTO[seguimiento].toLowerCase()}`
              : atiendeSinPoseer
                ? "Clientes que atiendo"
                : "Mi cartera"
        }
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
              : seguimiento?.startsWith("sin")
                ? "No queda nadie sin gestión en ese período: todos sus clientes ya tienen una llamada, un WhatsApp o una visita."
                : seguimiento
                  ? "Ningún cliente tiene gestión en ese período todavía."
                  : q || rubro !== null
                ? "Sin resultados para esa búsqueda."
                : atiendeSinPoseer
                  ? "Todavía no hay clientes con trabajo de postventa."
                  : "Todavía no tiene clientes en su cartera."}
          </p>
        ) : (
          <EsperaDeNavegacion className="space-y-3">
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
                duenoCodigo: c.codigo_comercial,
                telefono: c.telefono ?? null,
                ultimaGestionAt: ultimaGestion.get(c.id)?.at ?? null,
                ultimaGestionTipo: ultimaGestion.get(c.id)?.tipo ?? null,
              }))}
              mostrarDueno={atiendeSinPoseer}
              // El comercial anota la llamada desde la fila, en SU expediente
              // comercial (0281). Postventa conserva su botón de siempre.
              seguimientoComercial={!atiendeSinPoseer}
            />
            <Paginacion pagina={pagina} totalPaginas={totalPaginas} total={total} desde={desde} hasta={hasta} />
          </EsperaDeNavegacion>
        )}
      </SeccionPanel>
    </div>
  );
}

/** La última gestión real (no notas) de cada cliente en los últimos 30 días. Fuera del componente por la regla de pureza. */
async function ultimasGestionesDe(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]): Promise<Map<string, { tipo: string; at: string }>> {
  const mapa = new Map<string, { tipo: string; at: string }>();
  if (ids.length === 0) return mapa;
  const desde = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data } = await supabase
    .from("actividades")
    .select("tipo, realizada_at, oportunidades!inner(cuenta_id)")
    .in("oportunidades.cuenta_id", ids)
    .not("tipo", "eq", "nota")
    .gte("realizada_at", desde)
    .order("realizada_at", { ascending: false })
    .limit(600);
  for (const g of (data ?? []) as unknown as { tipo: string; realizada_at: string; oportunidades: { cuenta_id: string } | null }[]) {
    const cid = g.oportunidades?.cuenta_id;
    if (cid && !mapa.has(cid)) mapa.set(cid, { tipo: g.tipo, at: g.realizada_at });
  }
  return mapa;
}
