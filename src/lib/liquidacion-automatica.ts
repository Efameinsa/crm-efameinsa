import type { SupabaseClient } from "@supabase/supabase-js";
import { totalesConIgv, redondear2, type RenglonConIgv } from "@/lib/igv";
import { textoCondicionPago } from "@/lib/postventa";

/**
 * LA LIQUIDACIÓN SE ARMA SOLA (0534; reunión 17-10, gerencia con Jhon).
 *
 * Gerencia, viendo a Jhon copiar el pedido a su plantilla de Excel: «lo cual
 * no tiene sentido, tiene que ser en automático». Todo lo que el CRM ya sabe
 * entra sin tocar nada: cliente, RUC, pedido, renglones del cierre, series,
 * abonos confirmados (fecha, banco, N.º de operación), la comisión que
 * descontó el banco, las facturas. Finanzas solo completa lo que no está
 * (`Complementos`): a qué factura va cada abono, la detracción o retención de
 * un servicio, las letras y una nota.
 *
 * «Por todos lados es una sola liquidación»: contado, anticipos, comisiones,
 * detracción y letras son el mismo formato; cambia qué filas aparecen abajo.
 */

export type TipoRetenido = "detraccion" | "retencion";

export interface Complementos {
  /** Factura de cada abono (id del abono → número), o «» = pendiente de factura. */
  facturaDeAbono: Record<string, string>;
  retenido: { tipo: TipoRetenido; pct: number; monto: number; cobrado: boolean } | null;
  letras: { cantidad: number; cadaDias: number; giro: string; interes: number } | null;
  guia: string;
  nota: string;
}

export interface RenglonLiquidacion {
  cantidad: number;
  descripcion: string;
  precioUnitario: number;
  importe: number;
}

export interface AbonoLiquidacion {
  id: string;
  fecha: string; // AAAA-MM-DD
  medio: string;
  operacion: string;
  /** Lo que entró a la cuenta (el abono se confirma neto, 0292). */
  neto: number;
  /** Lo que descontó el banco (comisión interplaza); lo cobra el comercial. */
  comision: number;
  createdAt: string;
}

export interface FacturaLiquidacion {
  numero: string;
  fechaEmision: string;
  registradaAt: string;
}

/** Lo que el CRM ya sabe del pedido: no lo escribe nadie. */
export interface BaseLiquidacion {
  servicioId: string;
  empresa: "EFAMEINSA" | "OPEN";
  cliente: string;
  clienteDoc: string | null;
  pedido: string;
  moneda: string;
  renglones: RenglonLiquidacion[];
  series: string[];
  subtotal: number;
  igv: number;
  total: number;
  abonos: AbonoLiquidacion[];
  /** Lo pagado antes de la cuenta de Finanzas (Excel, «pago confirmado» sin abonos). */
  pagadoSinDetalle: number;
  facturas: FacturaLiquidacion[];
  formaPago: string | null;
  cotizacion: string | null;
  ordenCompra: string | null;
  letrasCantidad: number | null;
  esServicio: boolean;
  /** Lo que se completó en la última liquidación generada: la siguiente parte de ahí. */
  anteriores: Complementos | null;
  /** Cuántas liquidaciones tiene ya el pedido: la nueva es la siguiente. */
  yaHay: number;
  retenidoGuardado: { tipo: TipoRetenido; monto: number; cobrado: boolean } | null;
}

export interface FilaPago {
  etiqueta: string;
  detalle: string;
  monto: number; // negativo = resta del saldo
}

export interface LetraLiquidacion {
  n: number;
  giro: string;
  vence: string;
  dias: number;
  monto: number;
}

export interface Liquidacion {
  base: BaseLiquidacion;
  numero: number;
  fecha: string;
  filas: FilaPago[];
  saldo: number;
  comisionPendiente: number;
  letras: LetraLiquidacion[];
  estado: "cancelado" | "pago_parcial" | "pendiente_pago";
  /** «OPERACIÓN CANCELADA», «OPERACIÓN PENDIENTE DE PAGO»… como en el Excel. */
  rotulo: string;
  /** La factura que va al historial; null = factura pendiente (avisa a Contabilidad). */
  facturaVigente: string | null;
  notas: string[];
}

export const NOMBRE_RETENIDO: Record<TipoRetenido, string> = { detraccion: "Detracción", retencion: "Retención" };
/** Los porcentajes de siempre: detracción de servicios 12 %, retención 3 %. */
export const PCT_RETENIDO: Record<TipoRetenido, number> = { detraccion: 12, retencion: 3 };

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${a}`;
};
const sumarDias = (fecha: string, dias: number) =>
  new Date(new Date(`${fecha}T12:00:00-05:00`).getTime() + dias * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

/**
 * La factura que le toca a cada abono cuando Finanzas no la eligió: la
 * primera que Contabilidad registró después de ese abono (el circuito es
 * abono → liquidación → factura). Lo que entró después de la última factura
 * queda «pendiente de factura»: es un anticipo nuevo.
 */
export function facturaSugerida(abono: Pick<AbonoLiquidacion, "createdAt">, facturas: FacturaLiquidacion[]): string {
  const orden = [...facturas].sort((a, b) => a.registradaAt.localeCompare(b.registradaAt));
  const siguiente = orden.find((f) => f.registradaAt >= abono.createdAt);
  return siguiente?.numero ?? "";
}

/** Lo que el diálogo trae ya puesto: lo de la liquidación anterior y lo que se deduce. */
export function complementosIniciales(b: BaseLiquidacion): Complementos {
  const ant = b.anteriores;
  const facturaDeAbono: Record<string, string> = {};
  for (const a of b.abonos) facturaDeAbono[a.id] = ant?.facturaDeAbono[a.id] || facturaSugerida(a, b.facturas);
  const retenido = b.retenidoGuardado
    ? { ...b.retenidoGuardado, pct: ant?.retenido?.pct ?? PCT_RETENIDO[b.retenidoGuardado.tipo] }
    : (ant?.retenido ?? null);
  const letras = ant?.letras ?? (b.letrasCantidad && b.letrasCantidad > 0
    ? { cantidad: b.letrasCantidad, cadaDias: 30, giro: new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }), interes: 0 }
    : null);
  return { facturaDeAbono, retenido, letras, guia: ant?.guia ?? "", nota: "" };
}

/** Arma la liquidación entera: filas de pago, saldo, letras, estado y notas. Pura (se prueba sin base). */
export function calcularLiquidacion(b: BaseLiquidacion, c: Complementos, hoy: string): Liquidacion {
  const filas: FilaPago[] = [];
  if (b.pagadoSinDetalle > 0.009) {
    filas.push({ etiqueta: "PAGOS ANTERIORES", detalle: "Registrados antes del CRM", monto: -b.pagadoSinDetalle });
  }
  const abonos = [...b.abonos].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.createdAt.localeCompare(y.createdAt));
  let comisiones = 0;
  abonos.forEach((a, i) => {
    const ft = (c.facturaDeAbono[a.id] ?? "").trim().toUpperCase();
    // Como en el Excel: el abono por lo que pagó el cliente y la comisión aparte.
    filas.push({
      etiqueta: `ABONO ${i + 1}`,
      detalle: `${fechaCorta(a.fecha)} ${a.medio} · Op. ${a.operacion}${ft ? ` · FT ${ft}` : " · FT PDTE"}`,
      monto: -redondear2(a.neto + a.comision),
    });
    if (a.comision > 0) {
      comisiones += a.comision;
      filas.push({ etiqueta: "COMISIÓN", detalle: `Descontada por el banco · ${fechaCorta(a.fecha)}`, monto: redondear2(a.comision) });
    }
  });
  let retenido = 0;
  if (c.retenido && c.retenido.monto > 0) {
    retenido = redondear2(c.retenido.monto);
    filas.push({
      etiqueta: NOMBRE_RETENIDO[c.retenido.tipo].toUpperCase(),
      detalle: `${c.retenido.pct} % · ${c.retenido.cobrado ? "cobrada" : "pendiente de cobro"}`,
      monto: -retenido,
    });
  }
  const pagado = b.pagadoSinDetalle + abonos.reduce((n, a) => n + a.neto, 0);
  const saldo = Math.max(0, redondear2(b.total - pagado - retenido));
  // La comisión la cobra el comercial (gerencia 17-10: «al comercial es el
  // responsable… postventa recibe, solamente para informativo»).
  const comisionPendiente = saldo > 0.5 ? redondear2(Math.min(saldo, comisiones)) : 0;

  let letras: LetraLiquidacion[] = [];
  if (c.letras && c.letras.cantidad > 0 && saldo > 0.5) {
    const n = Math.min(36, Math.floor(c.letras.cantidad));
    const conInteres = redondear2(saldo + Math.max(0, c.letras.interes || 0));
    const cuota = redondear2(conInteres / n);
    letras = Array.from({ length: n }, (_, i) => {
      const dias = (c.letras!.cadaDias || 30) * (i + 1);
      return {
        n: i + 1,
        giro: c.letras!.giro,
        vence: sumarDias(c.letras!.giro, dias),
        dias,
        // El centavo del redondeo, en la última.
        monto: i === n - 1 ? redondear2(conInteres - cuota * (n - 1)) : cuota,
      };
    });
  }

  const cancelado = saldo <= 0.5;
  const estado: Liquidacion["estado"] = cancelado ? "cancelado" : pagado > 0.009 || retenido > 0 ? "pago_parcial" : "pendiente_pago";
  let rotulo = cancelado ? "OPERACIÓN CANCELADA" : estado === "pago_parcial" ? "OPERACIÓN CON PAGO A CUENTA" : "OPERACIÓN PENDIENTE DE PAGO";
  if (cancelado && c.retenido && !c.retenido.cobrado) rotulo += ` · PENDIENTE COBRO DE LA ${NOMBRE_RETENIDO[c.retenido.tipo].toUpperCase()}`;
  if (!cancelado && comisionPendiente > 0 && comisionPendiente + 0.5 >= saldo) rotulo = "OPERACIÓN PENDIENTE: FALTA LA COMISIÓN DEL BANCO";
  if (!cancelado && letras.length) rotulo = `SALDO EN ${letras.length} LETRA${letras.length === 1 ? "" : "S"}`;

  // La factura del historial: con un abono sin factura, es un anticipo por
  // facturar (Contabilidad recibe el aviso); si no, la última emitida.
  const sinFactura = abonos.some((a) => !(c.facturaDeAbono[a.id] ?? "").trim());
  const ultima = [...b.facturas].sort((x, y) => y.registradaAt.localeCompare(x.registradaAt))[0]?.numero ?? null;
  const facturaVigente = sinFactura ? null : ultima;

  const usadas = [...new Set(abonos.map((a) => (c.facturaDeAbono[a.id] ?? "").trim().toUpperCase()).filter(Boolean))];
  const todas = [...new Set([...usadas, ...b.facturas.map((f) => f.numero.toUpperCase())])];
  const notas = [
    `FACTURA: ${todas.length ? todas.map((f) => `FT ${f}`).join(" // ") : "PDTE"}${sinFactura && todas.length ? " // ANTICIPO PDTE" : ""}`,
    `FORMA DE PAGO: ${b.formaPago ?? "—"}`,
    `COTIZACIÓN: ${b.cotizacion ?? "—"}`,
    `ORDEN DE COMPRA: ${b.ordenCompra?.trim() || "NA"}`,
    `GUÍA: ${c.guia.trim() || "PDTE"}`,
  ];
  if (c.retenido) notas.push(`OPERACIÓN AFECTA A ${NOMBRE_RETENIDO[c.retenido.tipo].toUpperCase()} (${c.retenido.pct} %)`);
  if (c.nota.trim()) notas.push(c.nota.trim());

  return { base: b, numero: b.yaHay + 1, fecha: hoy, filas, saldo, comisionPendiente, letras, estado, rotulo, facturaVigente, notas };
}

type Fila = Record<string, unknown>;

interface ItemGuardado extends RenglonConIgv {
  descripcion: string;
  bloque?: string | null;
  tipo?: string | null;
}

/** Junta del pedido todo lo que la liquidación necesita. null si no existe o no se puede ver. */
export async function cargarBaseLiquidacion(supabase: SupabaseClient, servicioId: string): Promise<BaseLiquidacion | null> {
  const { data: s } = await supabase
    .from("servicios_postventa")
    .select(
      "id, cuenta_id, cliente_texto, equipo, moneda, monto, monto_pagado, pct_antes_despacho, credito_dias, forma_pago, tipo_pedido, origen, informe_cierre_id, apertura_empresa, numero_pedido_erp, letras_cantidad, retenido_tipo, retenido_monto, retenido_cobrado_at",
    )
    .eq("id", servicioId)
    .maybeSingle();
  if (!s) return null;
  const f = s as Fila;

  const [inf, abonosQ, facturasQ, liqQ, equiposQ, cuentaQ] = await Promise.all([
    f.informe_cierre_id
      ? supabase
          .from("informes_cierre")
          .select("codigo, serie, cliente_nombre, cliente_doc, orden_compra, presupuesto_ref, modalidad_pago, items, moneda, cotizaciones!informes_cierre_cotizacion_id_fkey(codigo)")
          .eq("id", f.informe_cierre_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("pagos_pedido").select("id, monto, fecha_abono, operacion, medio, descuento_monto, created_at").eq("servicio_id", servicioId),
    supabase.from("facturas_pedido").select("numero, fecha_emision, created_at").eq("servicio_id", servicioId),
    supabase.from("liquidaciones_pedido").select("id, datos, generada, subida_at").eq("servicio_id", servicioId).order("subida_at", { ascending: false }),
    supabase.from("pedido_equipos").select("descripcion, serie, orden").eq("servicio_id", servicioId).order("orden"),
    f.cuenta_id ? supabase.from("cuentas").select("razon_social, num_doc").eq("id", f.cuenta_id as string).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const i = inf.data as Fila | null;
  const cuenta = cuentaQ.data as Fila | null;

  const items = ((i?.items as ItemGuardado[] | null) ?? []).filter((x) => x.bloque !== "gratuito" && Number(x.cantidad) > 0);
  let renglones: RenglonLiquidacion[];
  let totales: { subtotal: number; igv: number; total: number };
  if (items.length) {
    const t = totalesConIgv(items.map((x) => ({ cantidad: Number(x.cantidad), precio_unitario: Number(x.precio_unitario), precio_con_igv: x.precio_con_igv })));
    renglones = items.map((x) => ({
      cantidad: Number(x.cantidad),
      descripcion: String(x.descripcion ?? "").trim(),
      precioUnitario: Number(x.precio_unitario),
      importe: redondear2(Number(x.cantidad) * Number(x.precio_unitario)),
    }));
    totales = t;
  } else {
    // Sin cierre en el CRM (pedido del Excel): un renglón con el equipo y el monto del pedido.
    const total = redondear2(Number(f.monto ?? 0));
    const neto = redondear2(total / 1.18);
    renglones = [{ cantidad: 1, descripcion: String(f.equipo ?? "Según pedido").trim(), precioUnitario: neto, importe: neto }];
    totales = { subtotal: neto, igv: redondear2(total - neto), total };
  }
  // El total del pedido manda si difiere (flete, ajuste de Central): la liquidación cuadra con lo que se cobra.
  const totalPedido = f.monto == null ? totales.total : redondear2(Number(f.monto));

  const abonos: AbonoLiquidacion[] = ((abonosQ.data ?? []) as Fila[]).map((a) => ({
    id: a.id as string,
    fecha: a.fecha_abono as string,
    medio: String(a.medio ?? ""),
    operacion: String(a.operacion ?? ""),
    neto: Number(a.monto),
    comision: Number(a.descuento_monto ?? 0),
    createdAt: a.created_at as string,
  }));
  const sumaAbonos = abonos.reduce((n, a) => n + a.neto, 0);
  const pagadoSinDetalle = Math.max(0, redondear2(Number(f.monto_pagado ?? 0) - sumaAbonos));

  const liqs = (liqQ.data ?? []) as Fila[];
  const ultimaGenerada = liqs.find((l) => l.generada && l.datos);
  const serie = ((i?.serie ?? f.apertura_empresa) as "EFAMEINSA" | "OPEN" | null) ?? "EFAMEINSA";
  const modalidad = ((i?.modalidad_pago as string[] | null) ?? []).join(" / ");
  const condicion = textoCondicionPago({ pct_antes_despacho: f.pct_antes_despacho as number | null, credito_dias: f.credito_dias as number | null });
  const tipoPedido = String(f.tipo_pedido ?? "");

  return {
    servicioId,
    empresa: serie,
    cliente: String((cuenta?.razon_social as string | null) ?? (i?.cliente_nombre as string | null) ?? f.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, ""),
    clienteDoc: (i?.cliente_doc as string | null) ?? (cuenta?.num_doc as string | null) ?? null,
    pedido: (f.numero_pedido_erp as string | null) ?? (i?.codigo as string | null) ?? "—",
    moneda: (f.moneda as string | null) ?? (i?.moneda as string | null) ?? "USD",
    renglones,
    series: ((equiposQ.data ?? []) as Fila[]).filter((e) => String(e.serie ?? "").trim()).map((e) => `${String(e.descripcion ?? "").split("\n")[0].trim()} · SERIE: ${String(e.serie).trim()}`),
    subtotal: totales.subtotal,
    igv: redondear2(totalPedido - totales.subtotal),
    total: totalPedido,
    abonos,
    pagadoSinDetalle,
    facturas: ((facturasQ.data ?? []) as Fila[]).map((x) => ({ numero: String(x.numero), fechaEmision: String(x.fecha_emision), registradaAt: String(x.created_at) })),
    // La forma de pago escrita en el pedido manda; si no hay, la del cierre o la condición.
    formaPago: (f.forma_pago as string | null)?.trim() || modalidad || condicion || null,
    cotizacion: ((i?.cotizaciones as { codigo?: string } | null)?.codigo ?? (i?.presupuesto_ref as string | null)) || null,
    ordenCompra: (i?.orden_compra as string | null) ?? null,
    letrasCantidad: (f.letras_cantidad as number | null) ?? null,
    esServicio: /servicio|mantenimiento/i.test(tipoPedido) || /servicio|mantenimiento/i.test(String(f.equipo ?? "")),
    anteriores: (ultimaGenerada?.datos as Complementos | null) ?? null,
    yaHay: liqs.length,
    retenidoGuardado:
      f.retenido_tipo && Number(f.retenido_monto ?? 0) > 0
        ? { tipo: f.retenido_tipo as TipoRetenido, monto: Number(f.retenido_monto), cobrado: f.retenido_cobrado_at != null }
        : null,
  };
}
