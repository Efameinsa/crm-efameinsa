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

  const [{ data: decls }, { data: ventas }, { data: tcFila }] = await Promise.all([
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

  return lunes.map((l) => {
    const v = porLunes.get(l);
    const dec = declPorLunes.get(l);
    return {
      lunes: l,
      sabado: sabadoDe(l),
      vendidoUsd: v?.monto ?? 0,
      ventas: v?.n ?? 0,
      compromiso: dec?.compromiso ?? null,
      necesidades: dec?.necesidades ?? null,
      sinNecesidades: dec?.sin_necesidades ?? false,
      declaradoAt: dec?.declarado_at ?? null,
      esLaActual: l === actual,
    };
  });
}
