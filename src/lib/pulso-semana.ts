import type { createClient } from "@/lib/supabase/server";
import { SEMANAS_POR_MES } from "@/lib/periodo";
import { lunesDe, sumarDias } from "@/lib/calendario";

/**
 * Cómo va la semana, en una sola barra de tres tramos.
 *
 * Pedido de gerencia (28-08, vía Darwin): «una barra horizontal de progreso de
 * la semana, de cómo se va gestionando… que diferencie cotizaciones, gestiones
 * y ventas, para que se motiven viendo su barra de progreso».
 *
 * POR QUÉ TRES TRAMOS Y NO UNA BARRA APILADA. Se probó con los datos reales de
 * la semana del 24-08: 130 gestiones, 27 cotizaciones por US$ 323.000 y 2
 * ventas por US$ 6.132, contra una meta semanal de US$ 28.846. En una sola
 * escala no hay diseño que funcione — el cotizado es diez veces la meta y las
 * ventas quedan en un pelo invisible. Así que cada tramo se llena contra SU
 * propia referencia y los tres significan lo mismo: qué tan lleno está lo suyo.
 *
 * DE DÓNDE SALE CADA REFERENCIA (ninguna es inventada acá):
 *  · Gestiones → `perfiles.meta_gestiones_diarias` × 6 días, porque en
 *    Efameinsa se trabaja hasta el sábado. Desde la migración 0117 la meta es
 *    de cada uno —30 al día, 35 Katerine— y `parametros.meta_seguimientos_diarios`
 *    quedó de respaldo para quien no tenga la suya. Se cuentan con la MISMA
 *    definición que la supervisión diaria —efectivas, sin los NO_CONTESTO, sin
 *    las de postventa— o el comercial vería 130 acá y 150 allá contra la misma
 *    meta.
 *  · Cotizaciones → `perfiles.meta_cotizaciones_semanal` (36, y 42 Katerine),
 *    que sale del embudo real de 2026: 5 gestiones efectivas dan 1 cotización y
 *    10 cotizaciones dan 1 venta, con un ticket promedio de US$ 8.714. Con 180
 *    gestiones a la semana eso da 36 cotizaciones y US$ 31.400 — o sea que el
 *    embudo cierra con la meta de dinero, que es lo único que importa que
 *    cierre. Si la meta no está puesta, cae al promedio propio del comercial,
 *    contando el CRM Y el archivo de documentos: mirando solo el CRM el
 *    promedio da cero (todas las enviadas son de esta misma semana) y las 27
 *    cotizaciones de Brenda se verían como una barra vacía.
 *  · Ventas → la meta mensual de RRHH repartida entre las semanas del mes, el
 *    mismo reparto que usa el panel (ver `cargarResumenGerencia`).
 */

/** Semanas hacia atrás que se miran para el promedio de cotizaciones. */
const SEMANAS_DE_REFERENCIA = 8;
/** Días laborables de la semana en Efameinsa: lunes a sábado. */
const DIAS_LABORABLES = 6;
/** Piso del promedio de cotizaciones: con una sola semana de historial, un
 *  promedio de 1 haría que la barra se llene con la primera cotización. */
const PISO_COTIZACIONES = 5;

export type ClaveTramo = "gestiones" | "cotizaciones" | "ventas";

export interface TramoSemana {
  clave: ClaveTramo;
  etiqueta: string;
  /** Lo hecho en la semana. Gestiones y cotizaciones son conteos; ventas, US$. */
  hecho: number;
  /** La referencia contra la que se llena. null = todavía no hay una. */
  objetivo: number | null;
  /** De dónde sale el objetivo, para decirlo en pantalla. */
  origenObjetivo: string;
  esDinero: boolean;
}

export interface PulsoSemana {
  comercialId: string;
  nombre: string;
  codigo: string | null;
  lunes: string;
  sabado: string;
  tramos: TramoSemana[];
}

interface FilaPerfil {
  id: string;
  nombre: string;
  codigo_comercial: string | null;
  meta_mensual: number | null;
  /** Metas propias (migración 0117). NULL = cae al respaldo de siempre. */
  meta_gestiones_diarias: number | null;
  meta_cotizaciones_semanal: number | null;
}

const iso = (d: string) => d.slice(0, 10);
/** El día en Lima de un timestamptz. Tomar los 10 primeros del UTC corre el
 *  día para todo lo registrado después de las 19:00 — ya pasó dos veces acá. */
const diaLima = (ts: string) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

/**
 * El pulso de la semana de uno o de todos los comerciales.
 *
 * Se pide en una sola tanda de consultas y se agrupa en TypeScript: pedirlo
 * comercial por comercial serían cuatro consultas por cada uno, y esto va en
 * la pantalla de inicio.
 */
export async function cargarPulsoSemana(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lunes: string,
  comercialId?: string | null,
): Promise<PulsoSemana[]> {
  const sabado = sumarDias(lunes, DIAS_LABORABLES - 1);
  const desdeReferencia = sumarDias(lunes, -7 * SEMANAS_DE_REFERENCIA);

  let qPerfiles = supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial, meta_mensual, meta_gestiones_diarias, meta_cotizaciones_semanal")
    .eq("rol", "comercial")
    .eq("activo", true);
  if (comercialId) qPerfiles = qPerfiles.eq("id", comercialId);
  else qPerfiles = qPerfiles.eq("es_prueba", false).eq("es_soporte", false);

  // Las actividades se piden por `realizada_por` y no por el comercial de la
  // oportunidad: es el criterio de la supervisión diaria, y es el correcto —
  // la gestión la hace quien la hace.
  let qActividades = supabase
    .from("actividades")
    .select("realizada_por, realizada_at, catalogo_resultados_gestion(codigo), oportunidades(tipo_postventa)")
    .gte("realizada_at", `${lunes}T00:00:00`)
    .lte("realizada_at", `${sabado}T23:59:59`)
    .limit(3000);
  if (comercialId) qActividades = qActividades.eq("realizada_por", comercialId);

  let qCotsSemana = supabase
    .from("cotizaciones")
    .select("enviada_at, oportunidades!inner(comercial_id)")
    .not("enviada_at", "is", null)
    .gte("enviada_at", `${lunes}T00:00:00`)
    .lte("enviada_at", `${sabado}T23:59:59`)
    .limit(1000);

  // Para el promedio: solo las semanas ANTERIORES a la actual, que todavía no
  // terminó — meterla bajaría su propio promedio cada lunes por la mañana.
  let qCotsReferencia = supabase
    .from("cotizaciones")
    .select("enviada_at, oportunidades!inner(comercial_id)")
    .not("enviada_at", "is", null)
    .gte("enviada_at", `${desdeReferencia}T00:00:00`)
    .lt("enviada_at", `${lunes}T00:00:00`)
    .limit(3000);

  // El archivo de documentos: los presupuestos anteriores al CRM. `fecha` es
  // date, no timestamptz — no hay hora que corregir.
  let qArchivoSemana = supabase
    .from("cotizaciones_historicas")
    .select("comercial_id")
    .not("comercial_id", "is", null)
    .gte("fecha", lunes)
    .lte("fecha", sabado)
    .limit(1000);

  let qArchivoReferencia = supabase
    .from("cotizaciones_historicas")
    .select("comercial_id, fecha")
    .not("comercial_id", "is", null)
    .gte("fecha", desdeReferencia)
    .lt("fecha", lunes)
    .limit(3000);

  let qVentas = supabase
    .from("ventas")
    .select("monto_total, moneda, fecha_venta, oportunidades!inner(comercial_id)")
    .is("anulada_at", null)
    .gte("fecha_venta", lunes)
    .lte("fecha_venta", sabado)
    .limit(500);

  if (comercialId) {
    qCotsSemana = qCotsSemana.eq("oportunidades.comercial_id", comercialId);
    qCotsReferencia = qCotsReferencia.eq("oportunidades.comercial_id", comercialId);
    qArchivoSemana = qArchivoSemana.eq("comercial_id", comercialId);
    qArchivoReferencia = qArchivoReferencia.eq("comercial_id", comercialId);
    qVentas = qVentas.eq("oportunidades.comercial_id", comercialId);
  }

  const [
    { data: perfiles },
    { data: parametros },
    { data: actividades },
    { data: cotsSemana },
    { data: cotsRef },
    { data: archivoSemana },
    { data: archivoRef },
    { data: ventas },
  ] = await Promise.all([
    qPerfiles,
    supabase.from("parametros").select("clave, valor").in("clave", ["meta_seguimientos_diarios", "tc_usd_pen"]),
    qActividades,
    qCotsSemana,
    qCotsReferencia,
    qArchivoSemana,
    qArchivoReferencia,
    qVentas,
  ]);

  const parametro = (clave: string, porDefecto: number) => {
    const v = Number((parametros ?? []).find((p) => p.clave === clave)?.valor);
    return Number.isFinite(v) && v > 0 ? v : porDefecto;
  };
  const metaDiaria = parametro("meta_seguimientos_diarios", 30);
  const tc = parametro("tc_usd_pen", 3.75);

  const gestionesPorComercial = new Map<string, number>();
  for (const a of actividades ?? []) {
    const resultado = (a.catalogo_resultados_gestion as unknown as { codigo: string } | null)?.codigo;
    if (resultado === "NO_CONTESTO") continue; // intento, no seguimiento
    const op = a.oportunidades as unknown as { tipo_postventa: string | null } | null;
    if (op?.tipo_postventa) continue; // la carga de postventa no compite en la meta comercial
    const id = a.realizada_por as string;
    gestionesPorComercial.set(id, (gestionesPorComercial.get(id) ?? 0) + 1);
  }

  const comercialDe = (fila: { oportunidades: unknown }) =>
    (fila.oportunidades as { comercial_id: string } | null)?.comercial_id ?? null;

  const cotsPorComercial = new Map<string, number>();
  const sumar = (mapa: Map<string, number>, id: string | null) => {
    if (id) mapa.set(id, (mapa.get(id) ?? 0) + 1);
  };
  for (const c of cotsSemana ?? []) sumar(cotsPorComercial, comercialDe(c));
  for (const h of archivoSemana ?? []) sumar(cotsPorComercial, h.comercial_id as string | null);

  // Promedio por semana con actividad: si estuvo dos semanas de vacaciones,
  // esas semanas no le bajan la vara, y si recién empezó tampoco se le compara
  // contra semanas en las que no existía.
  const semanasPorComercial = new Map<string, Map<string, number>>();
  const contarSemana = (id: string | null, dia: string) => {
    if (!id) return;
    const semana = lunesDe(dia); // agrupa por semana, no por día
    const mapa = semanasPorComercial.get(id) ?? new Map<string, number>();
    mapa.set(semana, (mapa.get(semana) ?? 0) + 1);
    semanasPorComercial.set(id, mapa);
  };
  for (const c of cotsRef ?? []) contarSemana(comercialDe(c), diaLima(c.enviada_at as string));
  for (const h of archivoRef ?? []) contarSemana(h.comercial_id as string | null, iso(h.fecha as string));

  const ventasPorComercial = new Map<string, number>();
  for (const v of ventas ?? []) {
    const id = comercialDe(v);
    if (!id) continue;
    const monto = Number(v.monto_total) || 0;
    const usd = v.moneda === "PEN" ? monto / tc : monto;
    ventasPorComercial.set(id, (ventasPorComercial.get(id) ?? 0) + usd);
  }

  return ((perfiles ?? []) as FilaPerfil[]).map((p) => {
    const metaMensual = Number(p.meta_mensual) || 0;
    const metaSemanalUsd = metaMensual > 0 ? Math.round(metaMensual / SEMANAS_POR_MES) : null;

    // La meta propia manda; el parámetro global es el respaldo de quien no
    // tenga la suya, y el promedio propio el último recurso.
    const metaGestionesDiaria = p.meta_gestiones_diarias ?? metaDiaria;
    const promedioCots = promedioSemanal(semanasPorComercial.get(p.id));
    const metaCots = p.meta_cotizaciones_semanal ?? promedioCots;

    return {
      comercialId: p.id,
      nombre: p.nombre,
      codigo: p.codigo_comercial,
      lunes: iso(lunes),
      sabado,
      tramos: [
        {
          clave: "gestiones",
          etiqueta: "Gestiones",
          hecho: gestionesPorComercial.get(p.id) ?? 0,
          objetivo: metaGestionesDiaria * DIAS_LABORABLES,
          origenObjetivo: `${metaGestionesDiaria} al día × ${DIAS_LABORABLES} días, su meta`,
          esDinero: false,
        },
        {
          clave: "cotizaciones",
          etiqueta: "Cotizaciones",
          hecho: cotsPorComercial.get(p.id) ?? 0,
          objetivo: metaCots,
          origenObjetivo: p.meta_cotizaciones_semanal
            ? "su meta semanal de cotizaciones"
            : metaCots
              ? "su promedio de las últimas semanas"
              : "todavía sin historial para comparar",
          esDinero: false,
        },
        {
          clave: "ventas",
          etiqueta: "Ventas",
          hecho: Math.round(ventasPorComercial.get(p.id) ?? 0),
          objetivo: metaSemanalUsd,
          origenObjetivo: metaSemanalUsd ? "su meta mensual repartida entre las semanas del mes" : "sin meta mensual asignada",
          esDinero: true,
        },
      ],
    };
  });
}

/** Promedio de las semanas con actividad, con piso. null si no hay historial. */
export function promedioSemanal(porSemana: Map<string, number> | undefined): number | null {
  if (!porSemana || porSemana.size === 0) return null;
  const total = [...porSemana.values()].reduce((a, b) => a + b, 0);
  return Math.max(PISO_COTIZACIONES, Math.round(total / porSemana.size));
}
