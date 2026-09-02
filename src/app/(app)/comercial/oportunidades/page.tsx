import Link from "next/link";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listarOportunidades, contarOportunidadesPorEtapa, type OrdenOportunidades, type TipoClienteFiltro } from "@/lib/reportes";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { FiltrosOportunidades } from "@/components/crm/filtros-oportunidades";
import { TablaOportunidades } from "@/components/crm/tabla-oportunidades";
import { Paginacion } from "@/components/crm/filtros-clientes";
import { PipelineKanban, type OportunidadKanban } from "@/components/crm/pipeline-kanban";
import { RutaMantenimientoVista } from "@/components/crm/ruta-mantenimiento-vista";
import { alcanceDe, cargarOpcionesRubro, leerFiltroRubro, rubroParaRpc } from "../consultas-rubro";
import { cn } from "@/lib/utils";
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
  // El archivo de los Excel (0130). listar_oportunidades() lo deja fuera de
  // «Todas» y de cualquier otra pestaña: solo sale cuando se pide ESTA.
  "historico",
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
    modo?: string;
    q?: string;
    etapa?: string;
    tipo?: string;
    desde?: string;
    hasta?: string;
    solo_crm?: string;
    rubro?: string;
    orden?: string;
    pagina?: string;
    ver?: string;
    todos?: string;
    mant?: string;
    compra?: string;
    llamada?: string;
  }>;
}) {
  const perfil = await requerirPerfil();
  const sp = await searchParams;

  // La ruta de mantenimiento (plan 23, etapa 4): «es una campaña sobre el
  // mismo pipeline, no otro objeto» — se ve como pestaña acá, con la misma
  // regla de acceso que ya tenía su propia pantalla (`/comercial/ruta`, que
  // sigue funcionando igual). Para el comercial normal esta pestaña no
  // existe y el resto de la página no cambia.
  const puedeVerRuta = perfil.rol === "gerencia" || perfil.rol === "admin" || Boolean(perfil.es_postventa) || Boolean(perfil.hace_postventa);
  if (puedeVerRuta && sp.modo === "ruta") {
    return (
      <div className="space-y-4">
        <TabsModo modo="ruta" />
        <RutaMantenimientoVista perfil={perfil} sp={sp} hrefBase="/comercial/oportunidades?modo=ruta" />
      </div>
    );
  }

  const q = sp.q?.trim() ?? "";
  const etapa = ETAPAS.includes(sp.etapa as EtapaOportunidad) ? (sp.etapa as EtapaOportunidad) : null;
  // El tablero es para arrastrar el trabajo del día; el archivo no se arrastra.
  // Si alguien venía con la pestaña «Histórico» puesta y toca Kanban, se le
  // devuelve la Tabla en vez de un tablero vacío sin explicación (0130).
  const vista: "tabla" | "kanban" = sp.vista === "kanban" && etapa !== "historico" ? "kanban" : "tabla";
  const tipoCliente: TipoClienteFiltro | null = sp.tipo === "empresa" || sp.tipo === "persona" ? sp.tipo : null;
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(sp.desde ?? "") ? (sp.desde as string) : null;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta ?? "") ? (sp.hasta as string) : null;
  const soloCrm = sp.solo_crm === "1";
  const orden: OrdenOportunidades = ORDENES.includes(sp.orden as OrdenOportunidades) ? (sp.orden as OrdenOportunidades) : "reciente";
  const pagina = Math.max(1, parseInt(sp.pagina ?? "1", 10) || 1);
  const supabase = await createClient();

  // Rubro de la cuenta (Carlos, 01-09: «hoy me voy a centrar en mineras»):
  // un filtro más de listar_oportunidades()/contar_oportunidades_por_etapa()
  // desde la 0152, así que la Tabla, el Kanban y las pestañas lo respetan igual
  // que a los demás.
  const rubro = leerFiltroRubro(sp.rubro);
  const filtrosComunes = { q, tipoCliente, desde, hasta, soloCrm, rubro: rubroParaRpc(rubro) };
  const listar = (extra: { etapa?: string | null; limite: number; offset: number }) =>
    listarOportunidades(supabase, { ...filtrosComunes, orden, ...extra });

  const [{ data: motivos }, conteos, { opciones: opcionesRubro, sinRubro }] = await Promise.all([
    supabase.from("catalogo_motivos_rechazo").select("id, nombre").eq("activo", true).order("nombre"),
    contarOportunidadesPorEtapa(supabase, filtrosComunes),
    cargarOpcionesRubro(supabase, alcanceDe(perfil)),
  ]);
  // «Todas» cuenta lo mismo que muestra: el archivo tiene su propia pestaña y
  // no entra en el total, o el número prometería filas que la lista no trae.
  const totalGeneral = Object.entries(conteos).reduce((a, [e, n]) => (e === "historico" ? a : a + n), 0);
  const enHistorico = conteos["historico"] ?? 0;

  if (vista === "kanban") {
    // Una consulta por columna: cada etapa trae sus más recientes sin competir
    // con las demás por el cupo. Si el usuario eligió una etapa en las
    // pestañas, solo esa columna se llena (igual que hace la Tabla).
    const columnas = await Promise.all(
      ETAPAS_TABLERO.map(async (e) => {
        if (etapa && etapa !== e) return [] as Awaited<ReturnType<typeof listarOportunidades>>["filas"];
        const { filas } = await listar({ etapa: e, limite: POR_COLUMNA, offset: 0 });
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
        {puedeVerRuta && <TabsModo modo="kanban" />}
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
          enHistorico={enHistorico}
          rubro={rubro}
          opcionesRubro={opcionesRubro}
          sinRubro={sinRubro}
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

  const { total, filas } = await listar({
    etapa: etapa ?? undefined,
    limite: POR_PAGINA,
    offset: (pagina - 1) * POR_PAGINA,
  });
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const desdeFila = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const hastaFila = Math.min(total, pagina * POR_PAGINA);

  return (
    <div className="space-y-4">
      {puedeVerRuta && <TabsModo modo="kanban" />}
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
        enHistorico={enHistorico}
        rubro={rubro}
        opcionesRubro={opcionesRubro}
        sinRubro={sinRubro}
      />

      {/* El archivo se explica solo en cuanto se abre: nadie tiene que
          adivinar por qué esas filas no salían antes (0130). */}
      {etapa === "historico" && (
        <p className="rounded-lg border border-dashed border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Histórico.</span> Son las oportunidades que vinieron de los
          Excel de agosto y que nadie retomó dentro del CRM. No cuentan como pendientes —no salen en Mi día, en la
          agenda ni en el reporte— pero siguen siendo suyas, con todo su historial. Si quiere volver a trabajar
          alguna, use «Retomar»: vuelve a seguimiento con la próxima acción para hoy.
        </p>
      )}

      <SeccionPanel
        titulo={etapa === "historico" ? "Histórico" : "Mis oportunidades"}
        accion={<Paginacion pagina={pagina} totalPaginas={totalPaginas} total={total} desde={desdeFila} hasta={hastaFila} etiqueta="oportunidad" etiquetaPlural="oportunidades" />}
      >
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {rubro === "sin"
              ? "Todos sus clientes con oportunidades ya tienen rubro."
              : q || etapa || tipoCliente || desde || hasta || soloCrm || rubro !== null
                ? "Nada coincide con esos filtros."
                : "Aún no tiene oportunidades asignadas."}
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

/**
 * «Kanban de ventas» vs. «Ruta de mantenimiento»: dos preguntas sobre el
 * mismo pipeline, no dos pantallas. Solo aparece para quien puede ver la
 * ruta (postventa, quien además vende mantenimiento, y gerencia/admin) — el
 * comercial normal nunca la ve, y esta página no cambia para él.
 */
function TabsModo({ modo }: { modo: "kanban" | "ruta" }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link
        href="/comercial/oportunidades"
        className={cn(
          "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
          modo === "kanban" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
        )}
      >
        Ventas
      </Link>
      <Link
        href="/comercial/oportunidades?modo=ruta"
        className={cn(
          "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
          modo === "ruta" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
        )}
      >
        Ruta de mantenimiento
      </Link>
    </div>
  );
}
