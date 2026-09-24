import type { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { ETIQUETA_CANAL } from "@/lib/derivados-central";
import { cuentasPorCobrar, diasEntre, formatoMonto, pedidosPorConfirmar } from "@/lib/pagos-finanzas";
import type { EventoAgenda, Tarea } from "@/lib/propuesta/cola-del-dia";

/**
 * CENTRAL Y FINANZAS EN LA PROPUESTA (v2, 23-09).
 *
 * Aquí viven las lecturas que comparten las vistas nuevas (el tubo de
 * «Pedidos por liberar», «Por liquidar») y la cola del día de las dos áreas.
 * Una sola regla de en qué paso está cada cierre, para que la pestaña, el
 * número rojo y el «Hoy» nunca se contradigan.
 *
 * Solo LEEN: las cuentas de demostración entran en modo lectura, y el paso se
 * hace en la pantalla de siempre (/central/cierres, /finanzas/…).
 */

type Cliente = Awaited<ReturnType<typeof createClient>>;
const sinRuc = (s: string | null | undefined) => (s ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");
const diaLima = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short" });

// ─────────────────────────────────────────────────────────────────────────
// EL TUBO DE CENTRAL: del cierre emitido al pedido ejecutado
// ─────────────────────────────────────────────────────────────────────────

export type PasoCentral = "pedir_series" | "esperando_almacen" | "generar" | "esperando_liquidacion" | "revisar_liquidacion" | "ejecutar";
export type QuienEspera = "Central" | "Almacén" | "Finanzas";

export const PASOS_CENTRAL: { clave: PasoCentral; etiqueta: string; quien: QuienEspera; accion: string }[] = [
  { clave: "pedir_series", etiqueta: "Pedir series", quien: "Central", accion: "Pedir las series" },
  { clave: "esperando_almacen", etiqueta: "Esperando al almacén", quien: "Almacén", accion: "Ver el cierre" },
  { clave: "generar", etiqueta: "Generar pedido", quien: "Central", accion: "Generar el pedido" },
  { clave: "esperando_liquidacion", etiqueta: "Esperando liquidación", quien: "Finanzas", accion: "Ver el cierre" },
  { clave: "revisar_liquidacion", etiqueta: "Liquidación por revisar", quien: "Central", accion: "Revisar la liquidación" },
  { clave: "ejecutar", etiqueta: "Listo para ejecutar", quien: "Central", accion: "Marcar ejecutado" },
];

export interface CierrePorLiberar {
  informeId: string;
  servicioId: string | null;
  codigo: string;
  serie: "OPEN" | "EFAMEINSA";
  cliente: string;
  urgente: boolean;
  monto: number | null;
  moneda: string;
  paso: PasoCentral;
  /** Desde cuándo está en este paso. */
  desde: string;
  seriesCon: number;
  seriesTotal: number;
  numeroPedido: string | null;
  /** Central la devolvió y Finanzas todavía no sube la corregida. */
  rechazo: { motivo: string; at: string } | null;
  /** Salió con código de gerencia antes de la liquidación: falta cerrarla. */
  ejecutadoSinLiquidacion: boolean;
}

type FilaServicio = {
  id: string;
  informe_cierre_id: string;
  numero_pedido_erp: string | null;
  pedido_ejecutado_at: string | null;
  liquidacion_at: string | null;
  series_pedidas_at: string | null;
  liquidacion_adjunto: { path?: string } | null;
  liquidacion_subida_at: string | null;
  liquidacion_rechazada_at: string | null;
  liquidacion_rechazada_motivo: string | null;
  pedido_generado_at: string | null;
  created_at: string;
};

/** De a 50: `.in` con cientos de ids revienta la URL y vuelve vacío sin error. */
async function enTandas<T>(ids: string[], leer: (tanda: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const { data } = await leer(ids.slice(i, i + 50));
    out.push(...(data ?? []));
  }
  return out;
}

/**
 * Los cierres que Central todavía no termina de liberar, con el paso en que
 * está cada uno. Misma regla que /central/cierres: liberado = pedido
 * ejecutado Y liquidación aceptada; fuera los anulados y los devueltos al
 * comercial (esos están en la cola de él).
 */
export async function cierresPorLiberar(supabase: Cliente): Promise<CierrePorLiberar[]> {
  const [{ data: informes }, { data: devoluciones }] = await Promise.all([
    supabase
      .from("informes_cierre")
      .select("id, codigo, serie, cliente_nombre, emitido_at, urgente, monto_total, moneda")
      .not("emitido_at", "is", null)
      .is("anulado_at", null)
      .order("emitido_at", { ascending: false })
      .limit(200),
    supabase.from("devoluciones_cierre").select("informe_id").is("resuelto_at", null),
  ]);
  const devueltos = new Set((devoluciones ?? []).map((d) => d.informe_id as string));
  const vivos = ((informes ?? []) as { id: string; codigo: string; serie: string; cliente_nombre: string | null; emitido_at: string; urgente: boolean | null; monto_total: number | null; moneda: string | null }[]).filter(
    (i) => !devueltos.has(i.id),
  );
  if (vivos.length === 0) return [];

  const servicios = await enTandas<FilaServicio>(
    vivos.map((i) => i.id),
    (t) =>
      supabase
        .from("servicios_postventa")
        .select("id, informe_cierre_id, numero_pedido_erp, pedido_ejecutado_at, liquidacion_at, series_pedidas_at, liquidacion_adjunto, liquidacion_subida_at, liquidacion_rechazada_at, liquidacion_rechazada_motivo, pedido_generado_at, created_at")
        .in("informe_cierre_id", t) as unknown as PromiseLike<{ data: FilaServicio[] | null }>,
  );
  const porInforme = new Map(servicios.map((s) => [s.informe_cierre_id, s]));
  const pendientes = vivos.filter((i) => {
    const s = porInforme.get(i.id);
    return !(s?.pedido_ejecutado_at && s?.liquidacion_at);
  });

  const idsServicio = pendientes.map((i) => porInforme.get(i.id)?.id).filter((x): x is string => Boolean(x));
  const equipos = await enTandas<{ servicio_id: string; serie: string | null }>(idsServicio, (t) => supabase.from("pedido_equipos").select("servicio_id, serie").in("servicio_id", t));
  const series = new Map<string, { con: number; total: number }>();
  for (const e of equipos) {
    const x = series.get(e.servicio_id) ?? { con: 0, total: 0 };
    x.total += 1;
    if (e.serie?.trim()) x.con += 1;
    series.set(e.servicio_id, x);
  }

  return pendientes.map((i): CierrePorLiberar => {
    const s = porInforme.get(i.id) ?? null;
    const sr = s ? (series.get(s.id) ?? { con: 0, total: 0 }) : { con: 0, total: 0 };
    const completas = sr.total === 0 || sr.con === sr.total;
    let paso: PasoCentral;
    let desde: string;
    if (!s) {
      paso = "pedir_series";
      desde = i.emitido_at;
    } else if (!s.numero_pedido_erp) {
      if (!completas && s.series_pedidas_at) {
        paso = "esperando_almacen";
        desde = s.series_pedidas_at;
      } else if (!completas) {
        paso = "pedir_series";
        desde = s.created_at;
      } else {
        paso = "generar";
        desde = s.series_pedidas_at ?? s.created_at;
      }
    } else if (!s.liquidacion_at) {
      if (s.liquidacion_adjunto && s.liquidacion_subida_at) {
        paso = "revisar_liquidacion";
        desde = s.liquidacion_subida_at;
      } else {
        paso = "esperando_liquidacion";
        desde = s.liquidacion_rechazada_at ?? s.pedido_generado_at ?? s.created_at;
      }
    } else {
      paso = "ejecutar";
      desde = s.liquidacion_at;
    }
    return {
      informeId: i.id,
      servicioId: s?.id ?? null,
      codigo: i.codigo,
      serie: i.serie === "OPEN" ? "OPEN" : "EFAMEINSA",
      cliente: sinRuc(i.cliente_nombre),
      urgente: i.urgente === true,
      monto: i.monto_total == null ? null : Number(i.monto_total),
      moneda: i.moneda ?? "USD",
      paso,
      desde,
      seriesCon: sr.con,
      seriesTotal: sr.total,
      numeroPedido: s?.numero_pedido_erp ?? null,
      rechazo: s?.liquidacion_rechazada_at && !s.liquidacion_adjunto ? { motivo: s.liquidacion_rechazada_motivo ?? "sin motivo escrito", at: s.liquidacion_rechazada_at } : null,
      ejecutadoSinLiquidacion: Boolean(s?.pedido_ejecutado_at && !s.liquidacion_at),
    };
  });
}

export const quienTiene = (p: PasoCentral): QuienEspera => PASOS_CENTRAL.find((x) => x.clave === p)!.quien;

// ─────────────────────────────────────────────────────────────────────────
// LAS LIQUIDACIONES DE FINANZAS
// ─────────────────────────────────────────────────────────────────────────

export type EstadoLiquidacion = "rechazada" | "por_subir" | "subida";
export interface PedidoPorLiquidar {
  id: string;
  informeId: string;
  cliente: string;
  numeroPedido: string;
  codigoCierre: string | null;
  serie: "OPEN" | "EFAMEINSA" | null;
  monto: number | null;
  moneda: string;
  estado: EstadoLiquidacion;
  /** Desde cuándo está en ese estado. */
  desde: string;
  rechazo: { motivo: string; at: string } | null;
}

/** Los pedidos que Central ya generó y cuya liquidación no está aceptada (0290/0295). */
export async function pedidosPorLiquidar(supabase: Cliente): Promise<PedidoPorLiquidar[]> {
  const { data } = await supabase
    .from("servicios_postventa")
    .select("id, cliente_texto, numero_pedido_erp, monto, moneda, informe_cierre_id, liquidacion_adjunto, liquidacion_subida_at, liquidacion_rechazada_at, liquidacion_rechazada_motivo, pedido_generado_at, created_at")
    .not("numero_pedido_erp", "is", null)
    .not("informe_cierre_id", "is", null)
    .is("liquidacion_at", null)
    .is("cerrado_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  const filas = (data ?? []) as {
    id: string; cliente_texto: string | null; numero_pedido_erp: string; monto: number | null; moneda: string | null; informe_cierre_id: string;
    liquidacion_adjunto: { path: string } | null; liquidacion_subida_at: string | null; liquidacion_rechazada_at: string | null;
    liquidacion_rechazada_motivo: string | null; pedido_generado_at: string | null; created_at: string;
  }[];
  const informes = await enTandas<{ id: string; codigo: string; serie: string; anulado_at: string | null }>(
    [...new Set(filas.map((f) => f.informe_cierre_id))],
    (t) => supabase.from("informes_cierre").select("id, codigo, serie, anulado_at").in("id", t),
  );
  const inf = new Map(informes.map((i) => [i.id, i]));
  return filas
    .filter((f) => !inf.get(f.informe_cierre_id)?.anulado_at)
    .map((f): PedidoPorLiquidar => {
      const i = inf.get(f.informe_cierre_id);
      const estado: EstadoLiquidacion = f.liquidacion_adjunto ? "subida" : f.liquidacion_rechazada_at ? "rechazada" : "por_subir";
      return {
        id: f.id,
        informeId: f.informe_cierre_id,
        cliente: sinRuc(f.cliente_texto),
        numeroPedido: f.numero_pedido_erp,
        codigoCierre: i?.codigo ?? null,
        serie: i ? (i.serie === "OPEN" ? "OPEN" : "EFAMEINSA") : null,
        monto: f.monto == null ? null : Number(f.monto),
        moneda: f.moneda ?? "USD",
        estado,
        desde: (estado === "subida" ? f.liquidacion_subida_at : estado === "rechazada" ? f.liquidacion_rechazada_at : f.pedido_generado_at) ?? f.created_at,
        rechazo: estado === "rechazada" ? { motivo: f.liquidacion_rechazada_motivo ?? "sin motivo escrito", at: f.liquidacion_rechazada_at! } : null,
      };
    })
    .sort((a, b) => a.desde.localeCompare(b.desde));
}

// ─────────────────────────────────────────────────────────────────────────
// LA COLA DEL DÍA
// ─────────────────────────────────────────────────────────────────────────

/** Más de un día esperando es atraso; lo de hoy, hoy. */
const urgenciaPorEdad = (iso: string, hoy: string, diasAtraso = 1) => (diasEntre(diaLima(iso), hoy) >= diasAtraso ? "atrasado" : "hoy") as Tarea["urgencia"];
const dias = (iso: string, hoy: string) => {
  const d = diasEntre(diaLima(iso), hoy);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
};

export async function colaCentral(supabase: Cliente): Promise<{ tareas: Tarea[]; agenda: EventoAgenda[] }> {
  const hoy = hoyLima();
  const [{ data: leads }, cierres] = await Promise.all([
    supabase
      .from("leads")
      .select("id, canal, nombre_contacto, razon_social, mensaje, recibido_at")
      .eq("estado", "pendiente_triaje")
      .eq("es_prueba", false)
      .order("recibido_at", { ascending: true })
      .limit(100),
    cierresPorLiberar(supabase),
  ]);
  const tareas: Tarea[] = [];

  for (const l of (leads ?? []) as { id: string; canal: string | null; nombre_contacto: string | null; razon_social: string | null; mensaje: string | null; recibido_at: string }[]) {
    const quien = l.razon_social || l.nombre_contacto || "Contacto sin nombre";
    tareas.push({
      id: `ct-${l.id}`,
      urgencia: urgenciaPorEdad(l.recibido_at, hoy),
      tipo: "contacto",
      cliente: sinRuc(quien),
      que: `Derivar el contacto${l.canal ? ` · ${ETIQUETA_CANAL[l.canal] ?? l.canal}` : ""}`,
      porque: `Entró ${dias(l.recibido_at, hoy)} y todavía no tiene a quién. ${(l.mensaje ?? "").split("\n")[0].slice(0, 80)}`.trim(),
      accion: { etiqueta: "Derivar", href: "/central" },
    });
  }

  for (const c of cierres) {
    const base = `Cierre ${c.serie === "OPEN" ? "Open" : "Efameinsa"} ${c.codigo}`;
    const href = "/central/cierres";
    if (c.paso === "pedir_series") {
      tareas.push({ id: `cs-${c.informeId}`, urgencia: c.urgente ? "atrasado" : urgenciaPorEdad(c.desde, hoy), tipo: "serie", cliente: c.cliente, que: `Pedir las series · ${base}`, porque: `Se emitió ${dias(c.desde, hoy)}; sin series no sale el pedido.${c.urgente ? " Es urgente." : ""}`, accion: { etiqueta: "Pedir series", href } });
    } else if (c.paso === "generar") {
      tareas.push({ id: `cg-${c.informeId}`, urgencia: c.urgente ? "atrasado" : urgenciaPorEdad(c.desde, hoy), tipo: "pedido", cliente: c.cliente, que: `Generar el pedido · ${base}`, porque: c.seriesTotal > 0 ? `Las ${c.seriesTotal} series ya están: falta el pedido.` : "Ya tiene su lista de equipos: falta el pedido.", accion: { etiqueta: "Generar", href } });
    } else if (c.paso === "revisar_liquidacion") {
      tareas.push({ id: `cl-${c.informeId}`, urgencia: urgenciaPorEdad(c.desde, hoy), tipo: "liquidacion", cliente: c.cliente, que: `Revisar la liquidación · pedido ${c.numeroPedido}`, porque: `Finanzas la subió ${dias(c.desde, hoy)}. Acéptela o devuélvala con el motivo.`, accion: { etiqueta: "Revisar", href } });
    } else if (c.paso === "ejecutar") {
      tareas.push({ id: `ce-${c.informeId}`, urgencia: urgenciaPorEdad(c.desde, hoy), tipo: "pedido", cliente: c.cliente, que: `Marcar el pedido ejecutado · ${c.numeroPedido ? `pedido ${c.numeroPedido}` : base}`, porque: "Liquidación aceptada: postventa, el almacén y Finanzas esperan que lo libere.", accion: { etiqueta: "Ejecutar", href } });
    } else if (c.paso === "esperando_almacen" && diasEntre(diaLima(c.desde), hoy) >= 2) {
      // Solo si ya se demoró: entonces sí es de Central llamar al almacén.
      tareas.push({ id: `ca-${c.informeId}`, urgencia: "semana", tipo: "serie", cliente: c.cliente, que: `El almacén no manda las series · ${base}`, porque: `Pedidas ${dias(c.desde, hoy)}; van ${c.seriesCon} de ${c.seriesTotal}. Puede generar el pedido igual.`, accion: { etiqueta: "Ver", href } });
    }
  }
  return { tareas, agenda: [] };
}

export async function colaFinanzas(supabase: Cliente): Promise<{ tareas: Tarea[]; agenda: EventoAgenda[] }> {
  const hoy = hoyLima();
  const [porConfirmar, cobrar, liquidar] = await Promise.all([pedidosPorConfirmar(supabase), cuentasPorCobrar(supabase), pedidosPorLiquidar(supabase)]);
  const tareas: Tarea[] = [];
  const agenda: EventoAgenda[] = [];

  for (const p of porConfirmar) {
    const href = `/finanzas/pedidos/${p.id}`;
    const pedido = p.codigoCierre ? `cierre ${p.codigoCierre}` : p.numeroErp ? `pedido ${p.numeroErp}` : "pedido";
    const cuenta = p.serie === "OPEN" ? "cuenta Open" : "cuenta Efameinsa";
    const falta = formatoMonto(p.moneda, p.falta);
    const salida = p.fechaDespacho ? diasEntre(hoy, p.fechaDespacho) : null;
    if (p.solicitadoAt) {
      tareas.push({ id: `fs-${p.id}`, urgencia: urgenciaPorEdad(p.solicitadoAt, hoy, 2), tipo: "pago", cliente: p.cliente, que: `Confirmar el abono · ${pedido}`, porque: `Postventa lo pidió ${dias(p.solicitadoAt, hoy)}. Faltan ${falta} en la ${cuenta}.`, accion: { etiqueta: "Confirmar", href } });
    } else if (salida != null && salida <= 3) {
      tareas.push({ id: `fd-${p.id}`, urgencia: salida <= 0 ? "atrasado" : salida === 1 ? "hoy" : "semana", tipo: "pago", cliente: p.cliente, que: `Confirmar el abono · ${pedido}`, porque: `${salida < 0 ? `El despacho era hace ${-salida} días` : salida === 0 ? "Sale hoy" : salida === 1 ? "Sale mañana" : `Sale en ${salida} días`} y faltan ${falta} en la ${cuenta}.`, accion: { etiqueta: "Confirmar", href } });
    }
    if (p.fechaDespacho === hoy) {
      agenda.push({ id: `ag-${p.id}`, hora: "—", titulo: `Sale hoy · ${p.cliente}`, detalle: `Falta confirmar ${falta}`, href });
    }
  }

  for (const l of liquidar) {
    if (l.estado === "subida") continue;
    const cierre = l.codigoCierre ? ` · cierre ${l.codigoCierre}` : "";
    tareas.push(
      l.estado === "rechazada"
        ? { id: `lr-${l.id}`, urgencia: "atrasado", tipo: "liquidacion", cliente: l.cliente, que: `Corregir la liquidación · pedido ${l.numeroPedido}`, porque: `Central la devolvió ${dias(l.rechazo!.at, hoy)}: ${l.rechazo!.motivo}`, accion: { etiqueta: "Subir la corregida", href: "/finanzas/liquidar" } }
        : { id: `ls-${l.id}`, urgencia: urgenciaPorEdad(l.desde, hoy, 2), tipo: "liquidacion", cliente: l.cliente, que: `Subir la liquidación · pedido ${l.numeroPedido}${cierre}`, porque: `Central generó el pedido ${dias(l.desde, hoy)} y espera la liquidación para liberarlo.`, accion: { etiqueta: "Subir", href: "/finanzas/liquidar" } },
    );
  }

  for (const c of cobrar) {
    if (c.diasParaVencer == null || c.diasParaVencer > 3) continue;
    const vencido = c.diasParaVencer < 0;
    tareas.push({
      id: `cb-${c.id}`,
      urgencia: vencido ? "atrasado" : c.diasParaVencer === 0 ? "hoy" : "semana",
      tipo: "pago",
      cliente: c.cliente,
      que: `${vencido ? "Cobrar" : "Por vencer"} · ${formatoMonto(c.moneda, c.saldo)}`,
      porque: vencido ? `Venció el ${fechaCorta(`${c.venceEl}T12:00:00-05:00`)} (${-c.diasParaVencer} días).` : c.diasParaVencer === 0 ? "Vence hoy." : `Vence en ${c.diasParaVencer} días.`,
      accion: { etiqueta: "Ver", href: `/finanzas/pedidos/${c.id}` },
    });
  }
  return { tareas, agenda };
}
