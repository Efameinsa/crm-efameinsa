import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaLima } from "@/lib/fechas";
import {
  bloquesPedido,
  estadoPago,
  etiquetaResponsable,
  pedidoSinCobro,
  sinPrecios,
  type ServicioPostventa,
} from "@/lib/postventa";

/**
 * LOS PEDIDOS VISTOS POR PASO — lo que comparten la tabla «Por paso» del
 * control de pedidos y la agenda de postventa («Lo que falta»).
 *
 * Reunión de postventa del 13-10 (Carlos): «lo que ya está cerrado ya no
 * debería sumarse a todo lo que falta despacho… solamente que sume lo que está
 * abierto». Los contadores decían 104 «falta despacho» sobre 143 pedidos vivos.
 * Ninguno estaba cerrado en el sistema: lo que inflaba la cuenta eran las filas
 * que vinieron del Excel de despachos (25-08), de antes del circuito, que ya
 * salieron hace meses y nadie iba a cerrar en el CRM. Esas son la «historia del
 * Excel»: no suman en «Abiertos», siguen en «Todos» y tienen su propio filtro
 * para depurarlas. En cuanto alguien marca un paso en una que nadie había
 * movido, vuelve sola a «Abiertos».
 */

export interface PasoTabla {
  clave: string;
  etiqueta: string;
  hecho: boolean;
  cuando: string | null;
  trabado: string | null;
  dueno: string;
}

export interface FilaTabla {
  id: string;
  cliente: string;
  cuentaId?: string | null;
  equipo: string;
  pasos: PasoTabla[];
  /** Máquinas sin serie, con el motivo que marcó el almacén (null: sin motivo). 0378. */
  sinStock?: (string | null)[];
  /** Pagó una parte y debe el saldo (estadoPago «parcial»), confirmado o no por Finanzas. */
  pagoParcial?: boolean;
  /** Por qué es historia del Excel y no suma en «Abiertos» (null: está abierto). Reunión 13-10. */
  historia?: string | null;
}

/** Días después de la fecha de despacho del Excel en que una fila sin movimiento se da por historia. */
export const DIAS_HISTORIA = 30;

const DIA = 86_400_000;

function diasDesde(iso: string, hoy: Date): number {
  return (hoy.getTime() - new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).getTime()) / DIA;
}

/**
 * ¿Es una fila del Excel de antes del circuito que ya salió o que nadie movió?
 * Devuelve el motivo para mostrarlo, o null si el pedido está abierto.
 */
export function motivoHistoria(s: Pick<ServicioPostventa, "origen" | "informe_cierre_id" | "puesta_en_marcha" | "despachado_at" | "fecha_despacho" | "prueba_lista_at" | "prueba_solicitada_at" | "plano_enviado_at" | "direccion_verificada_at" | "apertura_despacho_at" | "pago_confirmado_at" | "preinstalacion_ok_at" | "aprobado_at" | "despacho_verificado_at">, hoy = new Date()): string | null {
  if (s.origen !== "excel" || s.informe_cierre_id != null) return null;
  if (s.puesta_en_marcha) return `Del Excel: ya tiene la puesta en marcha (${fechaLima(s.puesta_en_marcha)})`;
  if (s.despachado_at && diasDesde(s.despachado_at, hoy) > DIAS_HISTORIA) return `Del Excel: salió el ${fechaLima(s.despachado_at)}`;
  const sinMovimiento =
    !s.despachado_at &&
    !s.prueba_lista_at &&
    !s.prueba_solicitada_at &&
    !s.plano_enviado_at &&
    !s.direccion_verificada_at &&
    !s.apertura_despacho_at &&
    !s.pago_confirmado_at &&
    !s.preinstalacion_ok_at &&
    !s.aprobado_at &&
    !s.despacho_verificado_at;
  if (sinMovimiento && s.fecha_despacho && diasDesde(s.fecha_despacho, hoy) > DIAS_HISTORIA)
    return `Del Excel: despacho programado para el ${fechaLima(`${s.fecha_despacho}T12:00:00`)} y nadie lo movió en el CRM`;
  return null;
}

/**
 * ¿El pedido debe ese paso? Las claves que no son pasos son filtros:
 * «prueba_sin_pedir» (la prueba que nadie le pidió al almacén, reunión 23-09),
 * «pago_parcial» (buzón Ariana 13-10), «sin_stock» y «sin_stock:<motivo>» (0378)
 * y «historia» (reunión 13-10).
 */
export function debeElPaso(f: FilaTabla, clave: string): boolean {
  if (clave === "historia") return Boolean(f.historia);
  if (clave === "pago_parcial") return f.pagoParcial === true;
  if (clave === "sin_stock") return (f.sinStock?.length ?? 0) > 0;
  if (clave.startsWith("sin_stock:")) return (f.sinStock ?? []).some((m) => (m ?? "sin_motivo") === clave.slice(10));
  if (clave === "prueba_sin_pedir")
    return f.pasos.some((p) => p.clave === "prueba" && !p.hecho && !p.trabado) && !f.pasos.some((p) => p.clave === "despacho" && p.hecho);
  // «Listo para cerrar»: todo hecho menos el cierre.
  if (clave === "listo_cerrar") return f.pasos.some((p) => p.clave === "cerrado" && !p.hecho) && f.pasos.every((p) => p.hecho || p.clave === "cerrado");
  return f.pasos.some((p) => p.clave === clave && !p.hecho);
}

/** Los datos de la fila a partir del pedido (con los precios tapados si quien mira no los ve). */
export function filaDe(crudo: ServicioPostventa, verPrecios: boolean, hoy = new Date()): FilaTabla {
  const s = verPrecios ? crudo : sinPrecios(crudo);
  return {
    id: s.id,
    cliente: (s.cliente_texto ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, ""),
    cuentaId: s.cuenta_id ?? null,
    // El pedido anterior al circuito se reconoce de un vistazo (0239).
    equipo: (s.informe_cierre_id ? "" : "【anterior al circuito】 ") + (s.equipo ?? "Sin equipo"),
    pasos: bloquesPedido(s).flatMap((b) =>
      b.pasos.map((p) => ({
        clave: p.clave,
        etiqueta: p.etiqueta,
        hecho: p.hecho,
        cuando: p.cuando,
        trabado: p.trabado ?? null,
        dueno: etiquetaResponsable(p.responsable),
      })),
    ),
    pagoParcial: estadoPago(s) === "parcial" && !pedidoSinCobro(s),
    historia: motivoHistoria(crudo, hoy),
  };
}

type Informe = { enviada: string | null; conConstancia: boolean; listas: number };

/**
 * Lo que la tabla necesita además del pedido: las máquinas sin serie (sin
 * stock, 0378) y el informe técnico enviado al cliente (reunión 02-10). En
 * tandas de 100: un .in() con 250 ids revienta la URL (502 del nginx).
 */
export async function complementarFilas(supabase: SupabaseClient, filas: FilaTabla[]): Promise<FilaTabla[]> {
  const sinStockPor = new Map<string, (string | null)[]>();
  const informePor = new Map<string, Informe>();
  const ids = filas.map((f) => f.id);
  for (let i = 0; i < ids.length; i += 100) {
    const tanda = ids.slice(i, i + 100);
    const [{ data: ap }, { data: eq }] = await Promise.all([
      supabase.from("aperturas_llamada").select("servicio_id, informe_at, enviada_cliente_at, constancia_envio_path").in("servicio_id", tanda).is("anulada_at", null),
      supabase.from("pedido_equipos").select("servicio_id, sin_stock_motivo").in("servicio_id", tanda).or("serie.is.null,sin_stock_motivo.not.is.null").is("parte_de", null),
    ]);
    for (const x of (ap ?? []) as { servicio_id: string; informe_at: string | null; enviada_cliente_at: string | null; constancia_envio_path: string | null }[]) {
      const v = informePor.get(x.servicio_id) ?? { enviada: null, conConstancia: false, listas: 0 };
      if (x.informe_at) v.listas++;
      if (x.enviada_cliente_at && (!v.enviada || x.enviada_cliente_at > v.enviada)) v.enviada = x.enviada_cliente_at;
      if (x.constancia_envio_path) v.conConstancia = true;
      informePor.set(x.servicio_id, v);
    }
    for (const x of (eq ?? []) as { servicio_id: string; sin_stock_motivo: string | null }[]) {
      sinStockPor.set(x.servicio_id, [...(sinStockPor.get(x.servicio_id) ?? []), x.sin_stock_motivo]);
    }
  }
  return filas.map((f) => ({ ...f, pasos: conInforme(f.pasos, informePor.get(f.id)), sinStock: sinStockPor.get(f.id) }));
}

/** Mete el paso «Informe enviado» antes del cierre del pedido (reunión 02-10). */
function conInforme(pasos: PasoTabla[], inf: Informe | undefined): PasoTabla[] {
  if (!inf) return pasos;
  const paso = {
    clave: "informe",
    etiqueta: inf.enviada
      ? `Informe técnico enviado al cliente${inf.conConstancia ? " (con constancia)" : " (sin constancia, marcado antes del 02-10)"}`
      : inf.listas > 0
        ? "Informe técnico del almacén listo: falta enviarlo al cliente"
        : "Informe técnico: el almacén todavía no lo sube",
    hecho: Boolean(inf.enviada),
    cuando: inf.enviada,
    trabado: null,
    dueno: inf.listas > 0 ? "Postventa" : "Almacén",
  };
  const i = pasos.findIndex((p) => p.clave === "cerrado");
  return i < 0 ? [...pasos, paso] : [...pasos.slice(0, i), paso, ...pasos.slice(i)];
}

/** Los pedidos vivos del área, con todo lo que necesita la vista por paso. La misma consulta que el control. */
export async function cargarFilasPorPaso(supabase: SupabaseClient, verPrecios: boolean): Promise<FilaTabla[]> {
  const { data } = await supabase
    .from("servicios_postventa")
    .select("*")
    .eq("completado", false)
    .is("cerrado_at", null)
    .or("informe_cierre_id.is.null,pedido_ejecutado_at.not.is.null")
    .order("pedido_ejecutado_at", { ascending: false, nullsFirst: false })
    .order("fecha_confirmacion", { ascending: false, nullsFirst: false })
    .limit(250);
  const hoy = new Date();
  const filas = ((data ?? []) as unknown as ServicioPostventa[]).map((s) => filaDe(s, verPrecios, hoy));
  return complementarFilas(supabase, filas);
}

/** Hasta cuánto atrás una gestión al cliente hace «suyo» el pedido en el reporte. */
const DIAS_GESTION_PROPIA = 90;

/**
 * LOS PEDIDOS QUE TRABAJÓ UNA PERSONA (Santos, 16-10: «a Ariana solo le debe
 * aparecer lo de Ariana, a Rubí solo lo de Rubí, a Gabriela solo lo de
 * Gabriela»). La hoja «paso por paso» del reporte diario traía el área
 * entera: las tres recibían las mismas 25 hojas. `responsable_id` no sirve
 * para separar (146 de 152 abiertos dicen Rubí, por cómo se cargaron), así
 * que un pedido es de quien firmó alguno de sus pasos (las columnas `_por`,
 * 0473) o gestionó al cliente en los últimos 90 días. La lista completa del
 * área sigue en Control y en la agenda. Llave de servicio: la ruta ya
 * autorizó a quien pide el reporte.
 */
export async function filtrarPedidosQueTrabajo(admin: SupabaseClient, personaId: string, filas: FilaTabla[]): Promise<FilaTabla[]> {
  if (!filas.length) return filas;
  const desde = new Date(Date.now() - DIAS_GESTION_PROPIA * 86_400_000).toISOString();
  const cuentas = [...new Set(filas.map((f) => f.cuentaId).filter(Boolean))] as string[];
  const [{ data: pedidos }, { data: gestiones }] = await Promise.all([
    admin.from("servicios_postventa").select("*").in("id", filas.map((f) => f.id)),
    cuentas.length
      ? admin
          .from("actividades")
          .select("oportunidades!inner(cuenta_id)")
          .eq("realizada_por", personaId)
          .gte("realizada_at", desde)
          .in("oportunidades.cuenta_id", cuentas)
          .limit(2000)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const firmados = new Set(
    ((pedidos ?? []) as Record<string, unknown>[])
      .filter((s) => Object.entries(s).some(([k, v]) => k.endsWith("_por") && v === personaId))
      .map((s) => s.id as string),
  );
  const gestionadas = new Set(
    ((gestiones ?? []) as { oportunidades: { cuenta_id: string } | { cuenta_id: string }[] | null }[]).flatMap((g) =>
      (Array.isArray(g.oportunidades) ? g.oportunidades : g.oportunidades ? [g.oportunidades] : []).map((o) => o.cuenta_id),
    ),
  );
  return filas.filter((f) => firmados.has(f.id) || (f.cuentaId != null && gestionadas.has(f.cuentaId)));
}
