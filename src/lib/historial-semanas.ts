import { createClient } from "@/lib/supabase/server";
import { lunesSemana } from "@/lib/potenciales-semana";
import { sabadoDe } from "@/lib/cierre-semanal";

/**
 * El histórico de cierres de semana de un comercial.
 *
 * Carlos, 02-09, cerrando el tema: «también debería haber un histórico, ¿no?
 * De todos sus cierres». Es lo que convierte la declaración en un compromiso:
 * el lunes se puede abrir la de la semana pasada y preguntar «esto que
 * dijiste, ¿lo hiciste?».
 *
 * QUÉ SE MUESTRA Y QUÉ NO. Cada semana trae lo que se vendió y lo que se
 * declaró. NO trae lo proyectado: la proyección se arma con las oportunidades
 * que hoy tienen fecha de cierre, así que recalcularla para una semana pasada
 * daría un número que nadie vio ese sábado. Ese contraste vive en el PDF de
 * esa semana, que se genera con el corte de entonces.
 */

export interface SemanaCerrada {
  lunes: string;
  sabado: string;
  /** Gestiones y cotizaciones de esa semana, para poder decir «88 de 210». */
  gestiones: number;
  cotizaciones: number;
  /** Mirando la venta contra la meta semanal. */
  estado: "cumplio" | "cerca" | "lejos" | "sin_meta";
  /** Lo vendido esa semana, en dólares. */
  vendidoUsd: number;
  ventas: number;
  compromiso: string | null;
  necesidades: string | null;
  sinNecesidades: boolean;
  declaradoAt: string | null;
  /** La semana en curso: todavía se puede declarar y corregir. */
  esLaActual: boolean;
}

const SEMANAS = 12;

export async function cargarHistorialSemanas(
  comercialId: string,
  cliente?: Awaited<ReturnType<typeof createClient>>,
): Promise<SemanaCerrada[]> {
  const supabase = cliente ?? (await createClient());

  const actual = lunesSemana();
  // Las últimas doce semanas hacia atrás, empezando por la de hoy.
  const lunes: string[] = [];
  const d = new Date(`${actual}T12:00:00`);
  for (let i = 0; i < SEMANAS; i++) {
    lunes.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 7);
  }
  const masAntiguo = lunes[lunes.length - 1];
  const masReciente = sabadoDe(lunes[0]);

  const [{ data: decls }, { data: ventas }, { data: tcFila }, { data: perfil }, { data: acts }, { data: cots }] = await Promise.all([
    supabase
      .from("declaraciones_semana")
      .select("lunes, compromiso, necesidades, sin_necesidades, declarado_at")
      .eq("comercial_id", comercialId)
      .gte("lunes", masAntiguo)
      .order("lunes", { ascending: false }),
    supabase
      .from("ventas")
      .select("fecha_venta, monto_total, moneda, oportunidades!inner(comercial_id)")
      .eq("oportunidades.comercial_id", comercialId)
      .is("anulada_at", null)
      .gte("fecha_venta", masAntiguo)
      .lte("fecha_venta", masReciente)
      .limit(500),
    supabase.from("parametros").select("valor").eq("clave", "tc_usd_pen").maybeSingle(),
    supabase
      .from("perfiles")
      .select("meta_mensual, meta_gestiones_diarias, meta_cotizaciones_semanal")
      .eq("id", comercialId)
      .maybeSingle(),
    supabase
      .from("actividades")
      .select("realizada_at, oportunidades!inner(comercial_id)")
      .eq("oportunidades.comercial_id", comercialId)
      .in("tipo", ["llamada", "whatsapp", "email", "visita", "showroom", "reunion_online"])
      .gte("realizada_at", masAntiguo + "T00:00:00")
      .limit(5000),
    supabase
      .from("cotizaciones")
      .select("enviada_at, oportunidades!inner(comercial_id)")
      .eq("oportunidades.comercial_id", comercialId)
      .not("enviada_at", "is", null)
      .gte("enviada_at", masAntiguo + "T00:00:00")
      .limit(2000),
  ]);

  const tc = Number(tcFila?.valor) || 3.75;
  const porLunes = new Map<string, { monto: number; n: number }>();
  for (const v of ventas ?? []) {
    // A qué lunes pertenece esa venta.
    const f = new Date(`${String(v.fecha_venta).slice(0, 10)}T12:00:00`);
    const dia = f.getDay();
    f.setDate(f.getDate() - (dia === 0 ? 6 : dia - 1));
    const clave = f.toISOString().slice(0, 10);
    const usd = v.moneda === "PEN" ? Number(v.monto_total) / tc : Number(v.monto_total);
    const acc = porLunes.get(clave) ?? { monto: 0, n: 0 };
    porLunes.set(clave, { monto: acc.monto + usd, n: acc.n + 1 });
  }

  const declPorLunes = new Map((decls ?? []).map((x) => [String(x.lunes).slice(0, 10), x]));

  // Gestiones y cotizaciones, repartidas por semana (en hora de Lima).
  const lunesDeFecha = (f: Date): string => {
    const x = new Date(f);
    const dia = x.getDay();
    x.setDate(x.getDate() - (dia === 0 ? 6 : dia - 1));
    return x.toISOString().slice(0, 10);
  };
  const contar = (filas: Record<string, unknown>[] | null, campo: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const x of filas ?? []) {
      const enLima = new Date(new Date(String(x[campo])).toLocaleString("en-US", { timeZone: "America/Lima" }));
      const clave = lunesDeFecha(enLima);
      m.set(clave, (m.get(clave) ?? 0) + 1);
    }
    return m;
  };
  const gestionesPorLunes = contar(acts, "realizada_at");
  const cotsPorLunes = contar(cots, "enviada_at");

  // La meta semanal de venta sale de la mensual repartida (138.667 / 4,33 =
  // 32.000, el número que gerencia usa de memoria).
  const metaVenta = perfil?.meta_mensual ? Number(perfil.meta_mensual) / (52 / 12) : null;

  return lunes.map((l) => {
    const v = porLunes.get(l);
    const dec = declPorLunes.get(l);
    return {
      lunes: l,
      sabado: sabadoDe(l),
      vendidoUsd: v?.monto ?? 0,
      ventas: v?.n ?? 0,
      gestiones: gestionesPorLunes.get(l) ?? 0,
      cotizaciones: cotsPorLunes.get(l) ?? 0,
      estado: !metaVenta
        ? "sin_meta"
        : (v?.monto ?? 0) >= metaVenta
          ? "cumplio"
          : (v?.monto ?? 0) >= metaVenta * 0.7
            ? "cerca"
            : "lejos",
      compromiso: dec?.compromiso ?? null,
      necesidades: dec?.necesidades ?? null,
      sinNecesidades: dec?.sin_necesidades ?? false,
      declaradoAt: dec?.declarado_at ?? null,
      esLaActual: l === actual,
    };
  });
}
