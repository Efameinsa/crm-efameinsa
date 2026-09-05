import { createClient } from "@/lib/supabase/server";
import { cargarPotenciales, resumirSemana, type ProyeccionSemana } from "@/lib/potenciales-semana";

/**
 * El cierre de la semana.
 *
 * Pedido del ing. Carlos, reunión 27-08: «el cierre semanal, que va a ser los
 * sábados, tiene que ser un compendio de toda la información… matemáticamente
 * qué hiciste y qué dejaste de hacer». Y el contraste, con sus palabras: «tú
 * dijiste que ibas a vender 300.000, pero el resultado ahora va a aparecer acá:
 * vendido cero, debe menos 300.000».
 *
 * POR QUÉ SEMANAL Y NO MENSUAL, también con sus palabras: «si lo analizamos una
 * vez al mes, solamente 12 veces en el año no podríamos analizar; tiene que
 * analizarse día a día, semanalmente».
 *
 * DE DÓNDE SALE CADA NÚMERO
 *  · PROYECTADO: el mismo `resumirSemana()` que dibuja el cuadro de potenciales
 *    y el pie de la agenda. Tiene que ser el mismo o el cierre discutiría
 *    contra una cifra que el comercial nunca vio.
 *  · VENDIDO: TODAS las ventas de esa semana, hayan nacido en el CRM o hayan
 *    llegado por el import del Excel del comercial (28-08). Antes se filtraba
 *    `origen = 'crm'` y el cierre de Katerine daba «vendido cero» la semana en
 *    que había vendido US$ 21.000: la venta existía, pero como el dato entró
 *    por la migración, su propio cierre la ignoraba mientras el reporte de
 *    gerencia sí la contaba. La semana ya acota la consulta.
 *  · Todo en dólares, con el tipo de cambio de `parametros` — el mismo que usa
 *    el cuadro de potenciales.
 *
 * Se calcula en TypeScript y no en una función SQL nueva: el reporte diario ya
 * enseñó lo caro que sale tener la lógica del negocio repartida en funciones
 * que hay que redefinir enteras cada vez.
 */

const DIA_LARGO = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Los tipos de gestión que son CONTACTO con el cliente (mismo criterio que la
 *  supervisión diaria y el reporte, migración 0090). */
const TIPOS_CONTACTO = ["llamada", "whatsapp", "email", "visita", "showroom", "reunion_online"];

export interface VentaSemana {
  fecha: string;
  cliente: string;
  monto: number;
  moneda: string;
  montoUsd: number;
}

export interface DiaCierre {
  iso: string;
  etiqueta: string;
  proyectado: number;
  vendido: number;
  gestiones: number;
}

export interface CierreSemanal {
  lunes: string;
  sabado: string;
  comercial: { nombre: string; codigo: string | null };
  proyeccion: ProyeccionSemana;
  dias: DiaCierre[];
  proyectadoUsd: number;
  vendidoUsd: number;
  /** Vendido − proyectado. Negativo = lo que quedó debiendo. */
  diferenciaUsd: number;
  ventas: VentaSemana[];
  gestiones: number;
  cotizacionesEnviadas: number;
  cotizadoUsd: number;
  /**
   * Lo que el comercial declara al cerrar la semana (0177). Carlos, 02-09:
   * «en qué te estás comprometiendo, qué necesitas y qué te compromete para
   * la siguiente semana». Es null mientras no lo haya declarado.
   */
  declaracion: DeclaracionSemana | null;
}

export interface DeclaracionSemana {
  compromiso: string;
  necesidades: string | null;
  sinNecesidades: boolean;
  declaradoAt: string;
}

export function sabadoDe(lunes: string): string {
  const d = new Date(`${lunes}T12:00:00`);
  d.setDate(d.getDate() + 5);
  return d.toISOString().slice(0, 10);
}

export async function cargarCierreSemanal(lunes: string, comercialId: string): Promise<CierreSemanal> {
  const supabase = await createClient();
  const sabado = sabadoDe(lunes);

  const [{ potenciales, tc }, { data: perfil }, { data: ventasData }, { data: cotsData }, { data: actsData }, { data: declData }] =
    await Promise.all([
      cargarPotenciales(lunes, comercialId),
      supabase.from("perfiles").select("nombre, codigo_comercial").eq("id", comercialId).maybeSingle(),
      supabase
        .from("ventas")
        .select("fecha_venta, monto_total, moneda, oportunidades!inner(comercial_id, cuentas(razon_social))")
        .eq("oportunidades.comercial_id", comercialId)
        .is("anulada_at", null)
        .gte("fecha_venta", lunes)
        .lte("fecha_venta", sabado)
        .limit(300),
      supabase
        .from("cotizaciones")
        .select("total, moneda, enviada_at, oportunidades!inner(comercial_id)")
        .eq("oportunidades.comercial_id", comercialId)
        .not("enviada_at", "is", null)
        .gte("enviada_at", `${lunes}T00:00:00`)
        .lte("enviada_at", `${sabado}T23:59:59`)
        .limit(300),
      supabase
        .from("actividades")
        .select("realizada_at, tipo, oportunidades!inner(comercial_id)")
        .eq("oportunidades.comercial_id", comercialId)
        .in("tipo", TIPOS_CONTACTO)
        .gte("realizada_at", `${lunes}T00:00:00`)
        .lte("realizada_at", `${sabado}T23:59:59`)
        .limit(1000),
      // Lo que declaró al cerrar esta semana: el compromiso y lo que necesita.
      supabase
        .from("declaraciones_semana")
        .select("compromiso, necesidades, sin_necesidades, declarado_at")
        .eq("comercial_id", comercialId)
        .eq("lunes", lunes)
        .maybeSingle(),
    ]);

  const enUsd = (monto: number, moneda: string) => (moneda === "PEN" ? monto / tc : monto);

  const ventas: VentaSemana[] = (ventasData ?? []).map((v) => {
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

  const proyeccion = resumirSemana(lunes, potenciales);

  // Las gestiones se cuentan por día en hora de Lima: la columna es timestamptz
  // y tomar los diez primeros caracteres del UTC corre el día para todo lo
  // registrado después de las 19:00 (el mismo error de fecha que ya apareció
  // dos veces en este proyecto).
  const gestionesPorDia = new Map<string, number>();
  for (const a of actsData ?? []) {
    const dia = new Date(a.realizada_at as string).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    gestionesPorDia.set(dia, (gestionesPorDia.get(dia) ?? 0) + 1);
  }

  const vendidoPorDia = new Map<string, number>();
  for (const v of ventas) vendidoPorDia.set(v.fecha, (vendidoPorDia.get(v.fecha) ?? 0) + v.montoUsd);

  const dias: DiaCierre[] = proyeccion.dias.map((d, i) => ({
    iso: d.iso,
    etiqueta: `${DIA_LARGO[i]} ${d.iso.slice(8, 10)}`,
    proyectado: d.total,
    vendido: vendidoPorDia.get(d.iso) ?? 0,
    gestiones: gestionesPorDia.get(d.iso) ?? 0,
  }));

  const vendidoUsd = ventas.reduce((s, v) => s + v.montoUsd, 0);
  const cotizadoUsd = (cotsData ?? []).reduce((s, c) => s + enUsd(Number(c.total), c.moneda), 0);

  return {
    lunes,
    sabado,
    comercial: { nombre: perfil?.nombre ?? "—", codigo: perfil?.codigo_comercial ?? null },
    proyeccion,
    dias,
    proyectadoUsd: proyeccion.totalSemana,
    vendidoUsd,
    diferenciaUsd: vendidoUsd - proyeccion.totalSemana,
    ventas,
    gestiones: actsData?.length ?? 0,
    cotizacionesEnviadas: cotsData?.length ?? 0,
    cotizadoUsd,
    declaracion: declData
      ? {
          compromiso: declData.compromiso,
          necesidades: declData.necesidades,
          sinNecesidades: declData.sin_necesidades,
          declaradoAt: declData.declarado_at,
        }
      : null,
  };
}
