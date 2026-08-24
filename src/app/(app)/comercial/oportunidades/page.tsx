import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listarOportunidades, contarOportunidadesPorEtapa, type OrdenOportunidades, type TipoClienteFiltro } from "@/lib/reportes";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { FiltrosOportunidades } from "@/components/crm/filtros-oportunidades";
import { TablaOportunidades } from "@/components/crm/tabla-oportunidades";
import { Paginacion } from "@/components/crm/filtros-clientes";
import { PipelineKanban, type OportunidadKanban } from "@/components/crm/pipeline-kanban";
import type { EtapaOportunidad } from "@/types/database";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;
// Tope de fichas POR COLUMNA del tablero (no global): con 40 la columna se
// recorre con el pulgar sin volverse un archivo.
const POR_COLUMNA = 40;
// Las cinco etapas de trabajo del tablero — deben coincidir con COLUMNAS de
// pipeline-kanban.tsx (venta/rechazada/derivada están cerradas, no se
// arrastran).
const ETAPAS_TABLERO: EtapaOportunidad[] = ["asignada", "filtrada", "cotizada", "seguimiento", "potencial"];
const ORDENES: OrdenOportunidades[] = ["reciente", "monto", "proxima_accion", "cuenta"];
const ETAPAS: EtapaOportunidad[] = [
  "asignada",
  "filtrada",
  "cotizada",
  "seguimiento",
  "potencial",
  "venta",
  "rechazada",
  "derivada",
];

// Mis oportunidades.
//
// ⚠️ REHECHA (21-08, docs/10-plan-ajustes-reunion-21-08.md, Bloque A). Carlos,
// probando como comercial nuevo, no encontraba SUS oportunidades — literal:
// antes de importar el histórico de los Excel, el CRM no tenía ni una sola
// oportunidad en etapa intermedia. Con la importación
// (scripts/importar-oportunidades-historicas.mjs) Katerine pasó a tener
// ~15.000. Traerlas todas al navegador para filtrar en memoria (como hacía
// antes esta pantalla) repite el mismo bug que ya rompió "Mi cartera" y los
// reportes de gerencia: Supabase corta en 1.000 filas sin avisar.
//
// Ahora la vista Tabla pagina en Postgres (listar_oportunidades /
// contar_oportunidades_por_etapa, migración 0054) con los filtros que Carlos
// pidió probando el CRM: empresa vs persona natural, etapa, y "para
// retomar" por rango de fecha sobre proxima_accion_at (su flujo real con el
// Excel: "filtro julio, agosto y comienzo a presionar").
//
// La vista Kanban es harina de otro costal: es un tablero de trabajo diario
// para arrastrar tarjetas, no un archivo — mostrar miles de tarjetas
// históricas ahí sería inmanejable.
//
// ⚠️ CORREGIDO 24-08 (docs/11-plan-correcciones-prueba-23-08.md, A2). Antes se
// acotaba a `soloCrm: true` fijo. Como TODAS las oportunidades de los
// comerciales vienen del import de Excel (origen='historico_excel') y ninguna
// tenía origen='crm', el tablero salía COMPLETAMENTE VACÍO: Darwin lo reportó
// probando con C5 —«en Kanban no aparece ninguna etiqueta… no se ve el
// trabajo que tienen que realizar»— con 15.772 oportunidades en la Tabla.
// Ahora el tablero respeta los mismos filtros que la Tabla y trae las fichas
// POR COLUMNA (las N más recientes de cada etapa), no las N más recientes en
// total: si no, una sola etapa se comía el cupo y las demás quedaban vacías
// igual. El encabezado de cada columna dice cuántas hay de verdad.
export default async function OportunidadesPage({
  searchParams,
}: {
  searchParams: Promise<{
    vista?: string;
    q?: string;
    etapa?: string;
    tipo?: string;
    desde?: string;
    hasta?: string;
    solo_crm?: string;
    orden?: string;
    pagina?: string;
  }>;
}) {
  await requerirPerfil();
  const sp = await searchParams;

  const vista: "tabla" | "kanban" = sp.vista === "kanban" ? "kanban" : "tabla";
  const q = sp.q?.trim() ?? "";
  const etapa = ETAPAS.includes(sp.etapa as EtapaOportunidad) ? (sp.etapa as EtapaOportunidad) : null;
  const tipoCliente: TipoClienteFiltro | null = sp.tipo === "empresa" || sp.tipo === "persona" ? sp.tipo : null;
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(sp.desde ?? "") ? (sp.desde as string) : null;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta ?? "") ? (sp.hasta as string) : null;
  const soloCrm = sp.solo_crm === "1";
  const orden: OrdenOportunidades = ORDENES.includes(sp.orden as OrdenOportunidades) ? (sp.orden as OrdenOportunidades) : "reciente";
  const pagina = Math.max(1, parseInt(sp.pagina ?? "1", 10) || 1);

  const supabase = await createClient();
  const [{ data: motivos }, conteos] = await Promise.all([
    supabase.from("catalogo_motivos_rechazo").select("id, nombre").eq("activo", true).order("nombre"),
    contarOportunidadesPorEtapa(supabase, { q, tipoCliente, desde, hasta, soloCrm }),
  ]);
  const totalGeneral = Object.values(conteos).reduce((a, b) => a + b, 0);

  if (vista === "kanban") {
    // Una consulta por columna: cada etapa trae sus más recientes sin competir
    // con las demás por el cupo. Si el usuario eligió una etapa en las
    // pestañas, solo esa columna se llena (igual que hace la Tabla).
    const columnas = await Promise.all(
      ETAPAS_TABLERO.map(async (e) => {
        if (etapa && etapa !== e) return [] as Awaited<ReturnType<typeof listarOportunidades>>["filas"];
        const { filas } = await listarOportunidades(supabase, {
          q,
          etapa: e,
          tipoCliente,
          desde,
          hasta,
          soloCrm,
          orden,
          limite: POR_COLUMNA,
          offset: 0,
        });
        return filas;
      }),
    );
    const datos: OportunidadKanban[] = columnas.flat().map((op) => ({
      id: op.id,
      etapa: op.etapa as EtapaOportunidad,
      razon_social: op.razon_social,
      intencion: op.intencion,
      monto_estimado: op.monto_estimado,
      moneda: op.moneda,
      updated_at: op.updated_at,
      cotizacion_pendiente: op.cotizacion_estado === "pendiente_gerencia",
      cotizacion_rechazada: op.cotizacion_estado === "rechazada_gerencia",
    }));

    return (
      <div className="space-y-4">
        <FiltrosOportunidades
          vista={vista}
          q={q}
          etapa={etapa}
          tipoCliente={tipoCliente}
          desde={desde}
          hasta={hasta}
          soloCrm={soloCrm}
          orden={orden}
          conteos={conteos}
          totalGeneral={totalGeneral}
        />
        <p className="text-xs text-muted-foreground">
          El tablero es para trabajar el día a día: muestra hasta {POR_COLUMNA} fichas por columna, las más recientes
          según el orden elegido. El número junto a cada etapa dice cuántas hay en total — para verlas todas, filtrar
          o paginar desde la vista Tabla.
        </p>
        <PipelineKanban
          oportunidades={datos}
          motivos={motivos ?? []}
          totalesPorEtapa={conteos}
        />
      </div>
    );
  }

  const { total, filas } = await listarOportunidades(supabase, {
    q,
    etapa: etapa ?? undefined,
    tipoCliente,
    desde,
    hasta,
    soloCrm,
    orden,
    limite: POR_PAGINA,
    offset: (pagina - 1) * POR_PAGINA,
  });
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const desdeFila = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const hastaFila = Math.min(total, pagina * POR_PAGINA);

  return (
    <div className="space-y-4">
      <FiltrosOportunidades
        vista={vista}
        q={q}
        etapa={etapa}
        tipoCliente={tipoCliente}
        desde={desde}
        hasta={hasta}
        soloCrm={soloCrm}
        orden={orden}
        conteos={conteos}
        totalGeneral={totalGeneral}
      />

      <SeccionPanel
        titulo="Mis oportunidades"
        accion={<Paginacion pagina={pagina} totalPaginas={totalPaginas} total={total} desde={desdeFila} hasta={hastaFila} etiqueta="oportunidad" etiquetaPlural="oportunidades" />}
      >
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {q || etapa || tipoCliente || desde || hasta || soloCrm ? "Nada coincide con esos filtros." : "Aún no tiene oportunidades asignadas."}
          </p>
        ) : (
          <div className="space-y-3">
            <TablaOportunidades filas={filas} />
            <Paginacion pagina={pagina} totalPaginas={totalPaginas} total={total} desde={desdeFila} hasta={hastaFila} etiqueta="oportunidad" etiquetaPlural="oportunidades" />
          </div>
        )}
      </SeccionPanel>
    </div>
  );
}
