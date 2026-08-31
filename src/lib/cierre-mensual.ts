import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ETIQUETA_ACTIVIDAD } from "@/components/crm/etiquetas-actividad";
import { lunesDe, sumarDias, MESES } from "@/lib/calendario";

/**
 * El cierre del MES del comercial.
 *
 * Pedido del ing. Carlos el 31-08-2026, confirmado por Santos: «que los
 * comerciales también puedan descargar su reporte mensual». El alcance es solo
 * el mes — no un consolidado histórico.
 *
 * ES EL HERMANO MAYOR DEL CIERRE SEMANAL (`cierre-semanal.ts`): mismo camino de
 * descarga, misma marca, las mismas piezas. Lo que cambia es la vara con la que
 * se mide. La semana se compara contra lo que el comercial PROYECTÓ; el mes se
 * compara contra la META que fijó gerencia (`perfiles.meta_mensual`, migración
 * 0122: US$ 138.667 al mes, que son los US$ 32.000 semanales que se pidieron).
 * Y como la semana ya existe, acá se muestra semana por semana para ver cómo
 * evolucionó el mes.
 *
 * ── CÓMO SE CUENTAN LAS GESTIONES (la corrección del backlog B6) ───────────
 * El 31-08 el ing. Carlos reportó dos totales distintos para el mismo dato: la
 * agenda diaria de Brenda marcaba 14 el día 29 y su cierre semanal 19. Los dos
 * estaban «bien» y por eso nadie lo veía: el informe diario cuenta las
 * gestiones EFECTIVAS (`reporte_diario_comercial`: resultado ≠ NO_CONTESTO) y
 * el cierre semanal cuenta TODAS. Encima cada uno usa una llave distinta —el
 * diario cuenta por `realizada_por`, el semanal por el dueño de la
 * oportunidad— y el semanal arma el rango sin corrimiento de zona, así que se
 * le cuelan gestiones de las 19:00 en adelante del día anterior.
 *
 * LA REGLA CORRECTA, ya decidida, es la del informe diario, y es la que se usa
 * acá:
 *   · actividad de contacto: `llamada, whatsapp, email, visita, showroom,
 *     reunion_online` (el mismo criterio que la supervisión diaria, 0090);
 *   · contada por `realizada_por` — quien la hizo, no de quién es el cliente;
 *   · fechada en HORA DE LIMA;
 *   · efectiva = sin resultado, o con resultado distinto de «No contestó».
 * Y se muestran SIEMPRE los dos números juntos —«14 efectivas de 20
 * gestiones»— porque una sola cifra es justo lo que produjo la discusión.
 *
 * ── ZONA HORARIA ──────────────────────────────────────────────────────────
 * El servidor corre en UTC y el negocio vive en Lima (UTC−5 todo el año, sin
 * horario de verano). `realizada_at` y `enviada_at` son `timestamptz`: el
 * rango se arma con el corrimiento EXPLÍCITO (`T00:00:00-05:00`).
 * `cierre-semanal.ts` lo arma sin él y por eso se le pegan las gestiones de la
 * tarde-noche del día anterior; ese defecto NO se copia acá. `fecha_venta` es
 * `date` —un día de calendario— y va sin conversión ninguna.
 */

/** Los tipos de gestión que son CONTACTO con el cliente (migración 0090). */
const TIPOS_CONTACTO = ["llamada", "whatsapp", "email", "visita", "showroom", "reunion_online"];

/** Lima no tiene horario de verano: −05:00 todo el año. */
const OFFSET_LIMA = "-05:00";

export interface TipoGestion {
  tipo: string;
  etiqueta: string;
  total: number;
  efectivas: number;
}

export interface GestionesMes {
  total: number;
  efectivas: number;
  sinContacto: number;
  porTipo: TipoGestion[];
}

export interface VentaMes {
  fecha: string;
  cliente: string;
  monto: number;
  moneda: string;
  montoUsd: number;
}

export interface SemanaMes {
  desde: string;
  hasta: string;
  etiqueta: string;
  gestiones: number;
  efectivas: number;
  cotizaciones: number;
  cotizadoUsd: number;
  ventas: number;
  vendidoUsd: number;
}

export interface AbiertaMes {
  cliente: string;
  presupuesto: string | null;
  etapa: string;
  cierreProyectado: string | null;
  montoUsd: number;
}

export interface CierreMensual {
  /** «2026-08» */
  mes: string;
  desde: string;
  hasta: string;
  /** «Agosto de 2026» */
  rotulo: string;
  comercial: { nombre: string; codigo: string | null };
  gestiones: GestionesMes;
  cotizaciones: { cantidad: number; montoUsd: number };
  ventas: { cantidad: number; montoUsd: number; detalle: VentaMes[] };
  /** `meta_mensual` del perfil. `null` = no hay meta cargada; no se inventa una. */
  meta: { montoUsd: number | null; faltaUsd: number | null; avance: number | null };
  semanas: SemanaMes[];
  abiertas: { cantidad: number; montoUsd: number; detalle: AbiertaMes[] };
  tc: number;
  /** Ni una gestión, ni una cotización, ni una venta: el PDF lo dice y sale igual. */
  sinActividad: boolean;
}

/* ------------------------------------------------------------------ */
/* Fechas del mes — aritmética de calendario, nunca instantes          */
/* ------------------------------------------------------------------ */

const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** ¿«2026-08» es un mes escrito como corresponde? */
export function esMes(mes: string | null | undefined): boolean {
  return !!mes && RE_MES.test(mes);
}

/**
 * El mes que le sirve a quien viene a cerrar.
 *
 * Los primeros días del mes uno todavía está cerrando el anterior: el 2 de
 * septiembre nadie quiere el reporte de septiembre, que tiene un día. Hasta el
 * día 5 se ofrece el mes pasado; del 6 en adelante, el que está corriendo.
 */
export function mesPorDefecto(hoy: string): string {
  const dia = Number(hoy.slice(8, 10));
  const mes = hoy.slice(0, 7);
  if (dia > 5) return mes;
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

/** Primer y último día del mes, como fechas de calendario. */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number);
  return { desde: `${mes}-01`, hasta: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

/** «Agosto de 2026», para la cabecera del PDF. */
export function rotuloDelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const nombre = MESES[m - 1];
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} de ${y}`;
}

/**
 * Las semanas del mes, recortadas al mes.
 *
 * Semanas de lunes a domingo —la misma aritmética de `calendario.ts`, para no
 * tener dos calendarios que se separen con el tiempo— pero cortadas por los
 * bordes del mes: agosto de 2026 empieza sábado, así que su primera «semana»
 * son dos días. Se cuenta hasta el domingo y no hasta el sábado por lo mismo
 * que en `periodo.ts`: si alguien registró algo un domingo desde el celular,
 * cortar antes lo escondería del mes.
 */
export function semanasDelMes(mes: string): { desde: string; hasta: string; etiqueta: string }[] {
  const { desde, hasta } = rangoDelMes(mes);
  const semanas: { desde: string; hasta: string; etiqueta: string }[] = [];
  let cursor = desde;
  while (cursor <= hasta) {
    const finSemana = sumarDias(lunesDe(cursor), 6);
    const fin = finSemana > hasta ? hasta : finSemana;
    const dia = (iso: string) => String(Number(iso.slice(8, 10)));
    semanas.push({
      desde: cursor,
      hasta: fin,
      etiqueta: cursor === fin ? `Día ${dia(cursor)}` : `${dia(cursor)} al ${dia(fin)}`,
    });
    cursor = sumarDias(fin, 1);
  }
  return semanas;
}

/** El día de calendario, en Lima, al que pertenece un instante. */
export function diaLima(instante: string): string {
  return new Date(instante).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/* ------------------------------------------------------------------ */
/* Los datos                                                          */
/* ------------------------------------------------------------------ */

export async function cargarCierreMensual(mes: string, comercialId: string): Promise<CierreMensual> {
  const supabase = await createClient();
  const { desde, hasta } = rangoDelMes(mes);
  const inicioUtc = `${desde}T00:00:00${OFFSET_LIMA}`;
  const finUtc = `${hasta}T23:59:59.999${OFFSET_LIMA}`;

  const [{ data: tcFila }, { data: perfil }, { data: noContesto }] = await Promise.all([
    supabase.from("parametros").select("valor").eq("clave", "tc_usd_pen").maybeSingle(),
    supabase.from("perfiles").select("nombre, codigo_comercial, meta_mensual").eq("id", comercialId).maybeSingle(),
    // El resultado se identifica por CÓDIGO y no por nombre: «No contestó» se
    // puede reescribir desde el mantenimiento de listas de operaciones; el
    // código, no.
    supabase.from("catalogo_resultados_gestion").select("id").eq("codigo", "NO_CONTESTO"),
  ]);
  const tc = Number(tcFila?.valor) || 3.75;
  const idsNoContesto = new Set((noContesto ?? []).map((r) => String(r.id)));

  const [{ data: actsData }, { data: cotsData }, { data: ventasData }] = await Promise.all([
    // Por `realizada_por`: la gestión es de quien la hizo (regla del informe
    // diario). Tope alto a propósito: el mes más cargado de 2026 fueron 210
    // gestiones, pero Supabase corta en 1.000 filas SIN AVISAR y ese corte
    // silencioso ya rompió tres pantallas en este proyecto.
    //
    // ⚠️ ESTA CONSULTA VA CON EL CLIENTE ADMINISTRADOR, y es la única del
    // reporte que lo hace. Comprobado contra producción el 31-08: Brenda hizo
    // dos llamadas de agosto sobre una oportunidad que hoy es de Post Venta, y
    // la RLS de `actividades` —que mira al dueño de la OPORTUNIDAD, no a quien
    // registró la gestión— se las escondía. Con la sesión de ella el mes daba
    // «119 de 195» y su propio informe diario, que es una función SECURITY
    // DEFINER y no pasa por RLS, daba «120 de 197». Volvíamos al problema que
    // este reporte vino a cerrar: el mismo dato con dos cifras.
    //
    // Es seguro acá porque quien autoriza es la ruta (`/api/reportes/mensual`:
    // el reporte propio, o gerencia/admin/central pidiendo el de otro), la
    // consulta está clavada a `realizada_por = comercialId`, y lo único que
    // devuelve son tipo, fecha y resultado — ni un nombre de cliente, ni una
    // nota, ni un monto. Si algún día esto se llama desde otro sitio, ese sitio
    // tiene que autorizar igual antes.
    createAdminClient()
      .from("actividades")
      .select("realizada_at, tipo, resultado_id")
      .eq("realizada_por", comercialId)
      .in("tipo", TIPOS_CONTACTO)
      .gte("realizada_at", inicioUtc)
      .lte("realizada_at", finUtc)
      .limit(5000),
    supabase
      .from("cotizaciones")
      .select("total, moneda, enviada_at, oportunidades!inner(comercial_id)")
      .eq("oportunidades.comercial_id", comercialId)
      .not("enviada_at", "is", null)
      .gte("enviada_at", inicioUtc)
      .lte("enviada_at", finUtc)
      .limit(2000),
    // `fecha_venta` es `date`: día de calendario, sin conversión de zona. Las
    // anuladas quedan fuera — un cierre anulado conserva su número pero deja
    // de contar.
    supabase
      .from("ventas")
      .select("fecha_venta, monto_total, moneda, oportunidades!inner(comercial_id, cuentas(razon_social))")
      .eq("oportunidades.comercial_id", comercialId)
      .is("anulada_at", null)
      .gte("fecha_venta", desde)
      .lte("fecha_venta", hasta)
      .limit(500),
  ]);

  const enUsd = (monto: number, moneda: string) => (moneda === "PEN" ? monto / tc : monto);

  /* ── Gestiones ────────────────────────────────────────────────── */
  const porTipo = new Map<string, { total: number; efectivas: number }>();
  const gestionesPorDia = new Map<string, { total: number; efectivas: number }>();
  let total = 0;
  let efectivas = 0;
  for (const a of actsData ?? []) {
    const esEfectiva = a.resultado_id == null || !idsNoContesto.has(String(a.resultado_id));
    total += 1;
    if (esEfectiva) efectivas += 1;
    const t = porTipo.get(a.tipo) ?? { total: 0, efectivas: 0 };
    t.total += 1;
    if (esEfectiva) t.efectivas += 1;
    porTipo.set(a.tipo, t);
    const dia = diaLima(a.realizada_at as string);
    const d = gestionesPorDia.get(dia) ?? { total: 0, efectivas: 0 };
    d.total += 1;
    if (esEfectiva) d.efectivas += 1;
    gestionesPorDia.set(dia, d);
  }
  const gestiones: GestionesMes = {
    total,
    efectivas,
    sinContacto: total - efectivas,
    porTipo: [...porTipo.entries()]
      .map(([tipo, v]) => ({ tipo, etiqueta: ETIQUETA_ACTIVIDAD[tipo] ?? tipo, ...v }))
      .sort((a, b) => b.total - a.total),
  };

  /* ── Cotizaciones enviadas ────────────────────────────────────── */
  const cotsPorDia = new Map<string, { n: number; usd: number }>();
  let cotizadoUsd = 0;
  for (const c of cotsData ?? []) {
    const usd = enUsd(Number(c.total), c.moneda);
    cotizadoUsd += usd;
    const dia = diaLima(c.enviada_at as string);
    const d = cotsPorDia.get(dia) ?? { n: 0, usd: 0 };
    d.n += 1;
    d.usd += usd;
    cotsPorDia.set(dia, d);
  }

  /* ── Ventas ───────────────────────────────────────────────────── */
  const detalleVentas: VentaMes[] = (ventasData ?? []).map((v) => {
    const cuenta = (v.oportunidades as unknown as { cuentas: { razon_social: string } | null } | null)?.cuentas;
    const monto = Number(v.monto_total);
    return {
      fecha: String(v.fecha_venta).slice(0, 10),
      cliente: cuenta?.razon_social ?? "Cuenta sin nombre",
      monto,
      moneda: v.moneda,
      montoUsd: enUsd(monto, v.moneda),
    };
  });
  // De mayor a menor: gerencia pidió «el detalle de las más grandes», así que
  // las que sostienen el mes van arriba y no escondidas por orden de fecha.
  detalleVentas.sort((a, b) => b.montoUsd - a.montoUsd);
  const vendidoUsd = detalleVentas.reduce((s, v) => s + v.montoUsd, 0);

  /* ── Semana por semana ────────────────────────────────────────── */
  const semanas: SemanaMes[] = semanasDelMes(mes).map((s) => {
    const acumular = <T,>(mapa: Map<string, T>, aplicar: (v: T) => void) => {
      for (const [dia, v] of mapa) if (dia >= s.desde && dia <= s.hasta) aplicar(v);
    };
    let g = 0;
    let e = 0;
    acumular(gestionesPorDia, (v) => {
      g += v.total;
      e += v.efectivas;
    });
    let cn = 0;
    let cu = 0;
    acumular(cotsPorDia, (v) => {
      cn += v.n;
      cu += v.usd;
    });
    const ventasSemana = detalleVentas.filter((v) => v.fecha >= s.desde && v.fecha <= s.hasta);
    return {
      ...s,
      gestiones: g,
      efectivas: e,
      cotizaciones: cn,
      cotizadoUsd: cu,
      ventas: ventasSemana.length,
      vendidoUsd: ventasSemana.reduce((t, v) => t + v.montoUsd, 0),
    };
  });

  /* ── Lo que queda abierto al cierre del mes ───────────────────── */
  const abiertas = await cargarAbiertas(comercialId, finUtc, tc);

  /* ── La meta ──────────────────────────────────────────────────── */
  // `perfiles.meta_mensual`, en dólares (migración 0122). Si no hay meta o es
  // cero, no se inventa una: el PDF lo dice con todas las letras.
  const metaMonto = perfil?.meta_mensual != null ? Number(perfil.meta_mensual) : null;
  const meta =
    metaMonto && metaMonto > 0
      ? { montoUsd: metaMonto, faltaUsd: metaMonto - vendidoUsd, avance: vendidoUsd / metaMonto }
      : { montoUsd: null, faltaUsd: null, avance: null };

  return {
    mes,
    desde,
    hasta,
    rotulo: rotuloDelMes(mes),
    comercial: { nombre: perfil?.nombre ?? "—", codigo: perfil?.codigo_comercial ?? null },
    gestiones,
    cotizaciones: { cantidad: cotsData?.length ?? 0, montoUsd: cotizadoUsd },
    ventas: { cantidad: detalleVentas.length, montoUsd: vendidoUsd, detalle: detalleVentas },
    meta,
    semanas,
    abiertas,
    tc,
    sinActividad: total === 0 && (cotsData?.length ?? 0) === 0 && detalleVentas.length === 0,
  };
}

/**
 * El pipeline que sigue vivo cuando el mes cierra.
 *
 * QUÉ ENTRA: oportunidades abiertas —fuera `venta`, `rechazada`, `derivada` e
 * `historico`— que YA tienen una cotización enviada (el dinero que está sobre
 * la mesa), más las que el comercial declaró en negociación (`potencial`)
 * aunque todavía no haya cotizado. El monto es el de la última cotización
 * enviada; si no hay ninguna, el estimado que puso el comercial. Es el mismo
 * criterio de monto que usa el cuadro de potenciales de la semana
 * (`potenciales-semana.ts`), para que las dos pantallas digan lo mismo.
 *
 * POR QUÉ NO «TODAS LAS ABIERTAS». Hoy Katerine tiene 13.647 oportunidades
 * abiertas y Brenda 1.159: son las filas de los Excel que se importaron en
 * agosto y que nadie volvió a tocar. La migración 0130 abrió el estado
 * `historico` justo para eso, pero todavía no se movió ni una fila
 * (`scripts/sanear-oportunidades-fosiles.mjs` no se ha corrido), así que
 * contarlas daría un pipeline de fantasía. `historico` se excluye igual, para
 * que el día que se saneen esto siga estando bien.
 *
 * Se consulta DESDE `cotizaciones` y no desde `oportunidades`: así el filtro
 * pesado lo hace Postgres sobre las decenas de cotizaciones enviadas y no
 * sobre las decenas de miles de oportunidades.
 */
async function cargarAbiertas(
  comercialId: string,
  finUtc: string,
  tc: number,
): Promise<{ cantidad: number; montoUsd: number; detalle: AbiertaMes[] }> {
  const supabase = await createClient();
  const CERRADAS = "(venta,rechazada,derivada,historico)";

  const [{ data: cots }, { data: potenciales }] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select(
        "oportunidad_id, codigo, total, moneda, enviada_at, oportunidades!inner(etapa, cierre_proyectado, comercial_id, cuentas(razon_social))",
      )
      .eq("oportunidades.comercial_id", comercialId)
      .not("oportunidades.etapa", "in", CERRADAS)
      .not("enviada_at", "is", null)
      // Una cotización enviada DESPUÉS del mes no estaba sobre la mesa cuando
      // el mes cerró: el reporte de agosto no puede contar lo de septiembre.
      .lte("enviada_at", finUtc)
      .order("enviada_at", { ascending: false })
      .limit(1000),
    supabase
      .from("oportunidades")
      .select("id, etapa, cierre_proyectado, monto_estimado, moneda, cuentas(razon_social)")
      .eq("comercial_id", comercialId)
      .eq("etapa", "potencial")
      .limit(500),
  ]);

  const enUsd = (monto: number, moneda: string) => (moneda === "PEN" ? monto / tc : monto);
  const porOportunidad = new Map<string, AbiertaMes>();

  // Vienen de la más reciente a la más vieja: la primera que aparece de cada
  // oportunidad es su última cotización enviada.
  for (const c of cots ?? []) {
    if (porOportunidad.has(c.oportunidad_id)) continue;
    const o = c.oportunidades as unknown as {
      etapa: string;
      cierre_proyectado: string | null;
      cuentas: { razon_social: string } | null;
    } | null;
    porOportunidad.set(c.oportunidad_id, {
      cliente: o?.cuentas?.razon_social ?? "Cuenta sin nombre",
      presupuesto: c.codigo ?? null,
      etapa: o?.etapa ?? "—",
      cierreProyectado: o?.cierre_proyectado ?? null,
      montoUsd: enUsd(Number(c.total), c.moneda),
    });
  }

  for (const o of potenciales ?? []) {
    if (porOportunidad.has(o.id)) continue;
    const cuenta = o.cuentas as unknown as { razon_social: string } | null;
    porOportunidad.set(o.id, {
      cliente: cuenta?.razon_social ?? "Cuenta sin nombre",
      presupuesto: null,
      etapa: o.etapa as string,
      cierreProyectado: (o.cierre_proyectado as string | null) ?? null,
      montoUsd: o.monto_estimado != null ? enUsd(Number(o.monto_estimado), o.moneda ?? "USD") : 0,
    });
  }

  const detalle = [...porOportunidad.values()].sort((a, b) => b.montoUsd - a.montoUsd);
  return {
    cantidad: detalle.length,
    montoUsd: detalle.reduce((s, x) => s + x.montoUsd, 0),
    detalle,
  };
}
