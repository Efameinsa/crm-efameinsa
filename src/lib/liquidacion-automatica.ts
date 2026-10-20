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
 * El papel es el de su plantilla (OPERACION CONTADO NORMAL / CON ANTICIPO Y
 * LETRAS / CON COMISIONES / DE DETRACCION.xlsx): un BLOQUE por factura
 * («FT E001-826 · TOTAL · ABONO · COMISIÓN · TOTAL SALDO»), el bloque de lo
 * que falta («FT CIERRE PDTE»), el recuadro de la operación, la NOTA y las
 * letras. «Por todos lados es una sola liquidación»: cambian los bloques.
 */

export type TipoRetenido = "detraccion" | "retencion";

/**
 * LO QUE FINANZAS AJUSTA A MANO (Santos, 17-10: «que tenga un editor de
 * campos para ajustar alguna parte que desee»). Cada campo vacío = se usa lo
 * que trajo el CRM. Los renglones, si están, reemplazan a los del cierre y
 * los totales se recalculan con ellos.
 */
export interface AjustesLiquidacion {
  fecha?: string;
  cliente?: string;
  clienteDoc?: string;
  pedido?: string;
  renglones?: RenglonLiquidacion[] | null;
  /** Por abono: cómo se escribe el banco y la operación en el papel. */
  abonos?: Record<string, { medio?: string; operacion?: string }>;
  formaPago?: string;
  cotizacion?: string;
  ordenCompra?: string;
  /** El recuadro de la operación escrito a mano; vacío = lo calcula el CRM. */
  rotulo?: string;
}

export interface Complementos {
  /** Factura de cada abono (id del abono → número), o «» = pendiente de factura. */
  facturaDeAbono: Record<string, string>;
  /**
   * La factura de lo que falta cobrar (venta a crédito, saldo contra entrega):
   * Contabilidad la emite sin que haya abono (Jhon, buzón 17-10: «no veo el
   * cuadro donde colocar el número de factura»). «» = pendiente de factura.
   */
  facturaSaldo?: string;
  retenido: { tipo: TipoRetenido; pct: number; monto: number; cobrado: boolean } | null;
  letras: { cantidad: number; cadaDias: number; giro: string; interes: number } | null;
  guia: string;
  nota: string;
  ajustes?: AjustesLiquidacion;
}

/** La base con los ajustes de Finanzas encima; los totales se recalculan si cambió algún renglón. */
export function aplicarAjustes(b: BaseLiquidacion, a: AjustesLiquidacion | undefined): BaseLiquidacion {
  if (!a) return b;
  const t = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
  let renglones = b.renglones;
  let subtotal = b.subtotal, igv = b.igv, total = b.total;
  if (a.renglones) {
    renglones = a.renglones.map((r) => ({
      ...r,
      cantidad: Number(r.cantidad) || 0,
      precioUnitario: Number(r.precioUnitario) || 0,
      importe: redondear2((Number(r.cantidad) || 0) * (Number(r.precioUnitario) || 0)),
      series: (r.series ?? []).map((x) => x.trim()).filter(Boolean),
    }));
    subtotal = redondear2(renglones.filter((r) => !r.gratuito).reduce((n, r) => n + r.importe, 0));
    igv = redondear2(subtotal * 0.18);
    total = redondear2(subtotal + igv);
  }
  const abonos = a.abonos
    ? b.abonos.map((x) => {
        const e = a.abonos![x.id];
        return e ? { ...x, medio: t(e.medio) ?? x.medio, operacion: t(e.operacion) ?? x.operacion } : x;
      })
    : b.abonos;
  return {
    ...b,
    cliente: t(a.cliente) ?? b.cliente,
    clienteDoc: t(a.clienteDoc) ?? b.clienteDoc,
    pedido: t(a.pedido) ?? b.pedido,
    renglones,
    series: a.renglones ? [] : b.series,
    gratuito: valorGratuito(renglones),
    subtotal,
    igv,
    total,
    abonos,
    formaPago: t(a.formaPago) ?? b.formaPago,
    cotizacion: t(a.cotizacion) ?? b.cotizacion,
    ordenCompra: t(a.ordenCompra) ?? b.ordenCompra,
  };
}

export interface RenglonLiquidacion {
  cantidad: number;
  descripcion: string;
  precioUnitario: number;
  importe: number;
  /** Las series de ese renglón, como en la plantilla («SERIE: …» debajo del equipo). */
  series: string[];
  /**
   * Entrega gratuita (el bloque «VENTA 2 – GRATUITO» del cierre): sale en el
   * detalle con su valor, pero no entra a la base imponible, al IGV ni al total
   * por cobrar (Jhon, buzón 19-10).
   */
  gratuito?: boolean;
}

/** El valor de lo que se entrega gratis (sin IGV): va en su propio recuadro, aparte del total. */
export const valorGratuito = (renglones: RenglonLiquidacion[]) =>
  redondear2(renglones.filter((r) => r.gratuito).reduce((n, r) => n + r.importe, 0));

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

/** Quien firma al pie (la plantilla de Jhon: nombre, área, celular y correo). */
export interface FirmaLiquidacion {
  nombre: string;
  celular: string | null;
  correo: string | null;
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
  /** Series que no se pudieron poner bajo un renglón. */
  series: string[];
  /** Lo que se entrega gratis: no suma al subtotal, al IGV ni al total. */
  gratuito: number;
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
  /** Cuándo se validó esa última liquidación generada (para saber qué factura llegó después). */
  anterioresAt?: string | null;
  /** Cuántas liquidaciones tiene ya el pedido: la nueva es la siguiente. */
  yaHay: number;
  retenidoGuardado: { tipo: TipoRetenido; monto: number; cobrado: boolean } | null;
  firma: FirmaLiquidacion | null;
}

/** Una fila de un bloque: a la izquierda la factura o «fecha banco · op.», al medio el concepto, a la derecha el monto. */
export interface FilaBloque {
  izquierda: string;
  concepto: string;
  monto: number | null;
}

export interface BloqueLiquidacion {
  filas: FilaBloque[];
  saldo: number;
}

export interface LetraLiquidacion {
  n: number;
  giro: string;
  vence: string;
  dias: number;
  monto: number;
  interes: number;
}

export interface Liquidacion {
  base: BaseLiquidacion;
  numero: number;
  fecha: string;
  bloques: BloqueLiquidacion[];
  /** Las comisiones del banco, a la izquierda como en la plantilla. */
  comisiones: { izquierda: string; monto: number }[];
  saldo: number;
  comisionPendiente: number;
  letras: LetraLiquidacion[];
  estado: "cancelado" | "pago_parcial" | "pendiente_pago";
  /** «OPERACIÓN CANCELADA», «OPERACIÓN PENDIENTE DE PAGO»… como en el Excel. */
  rotulo: string;
  /** La factura que va al historial; null = factura pendiente (avisa a Contabilidad). */
  facturaVigente: string | null;
  /** Queda saldo por cobrar: el editor pide la factura de ese saldo. */
  hayCola: boolean;
  notas: string[];
  /** La nota libre de Finanzas: en la plantilla va a la izquierda («VALIDAR SI EMITE HES»). */
  notaLibre: string;
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
export function complementosIniciales(b: BaseLiquidacion, hoy: string): Complementos {
  const ant = b.anteriores;
  const facturaDeAbono: Record<string, string> = {};
  for (const a of b.abonos) facturaDeAbono[a.id] = ant?.facturaDeAbono[a.id] || facturaSugerida(a, b.facturas);
  // La del saldo: la última factura que no es de ningún abono (crédito: se factura antes de cobrar).
  const usadas = new Set(Object.values(facturaDeAbono).map((x) => x.trim().toUpperCase()).filter(Boolean));
  const libre = [...b.facturas].sort((x, y) => y.registradaAt.localeCompare(x.registradaAt)).find((f) => !usadas.has(f.numero.trim().toUpperCase()));
  // Si Finanzas la dejó en blanco a propósito (la factura se anuló con nota de
  // crédito: Jhon, buzón 19-10), sigue en blanco hasta que Contabilidad
  // registre otra después de esa liquidación.
  const dejoEnBlanco = ant != null && ant.facturaSaldo === "";
  const nueva = libre && (!b.anterioresAt || libre.registradaAt > b.anterioresAt) ? libre.numero : "";
  const facturaSaldo = ant?.facturaSaldo || (dejoEnBlanco ? nueva : libre?.numero) || "";
  const retenido = b.retenidoGuardado
    ? { ...b.retenidoGuardado, pct: ant?.retenido?.pct ?? PCT_RETENIDO[b.retenidoGuardado.tipo] }
    : (ant?.retenido ?? null);
  const letras = ant?.letras ?? (b.letrasCantidad && b.letrasCantidad > 0 ? { cantidad: b.letrasCantidad, cadaDias: 30, giro: hoy, interes: 0 } : null);
  // Los ajustes de la anterior (cliente corregido, renglones…) se heredan; la fecha no.
  const { fecha: _fecha, ...ajustes } = ant?.ajustes ?? {};
  void _fecha;
  return { facturaDeAbono, facturaSaldo, retenido, letras, guia: ant?.guia ?? "", nota: "", ajustes };
}

/** Arma la liquidación entera: bloques, saldo, letras, estado y notas. Pura (se prueba sin base). */
export function calcularLiquidacion(b0: BaseLiquidacion, c: Complementos, hoy: string): Liquidacion {
  const b = aplicarAjustes(b0, c.ajustes);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(c.ajustes?.fecha ?? "") ? c.ajustes!.fecha! : hoy;
  const abonos = [...b.abonos].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.createdAt.localeCompare(y.createdAt));
  const ftDe = (a: AbonoLiquidacion) => (c.facturaDeAbono[a.id] ?? "").trim().toUpperCase();

  // Los abonos, agrupados por factura en el orden en que entraron; los que no
  // tienen factura, juntos en «FT PDTE».
  const grupos: { ft: string; abonos: AbonoLiquidacion[] }[] = [];
  for (const a of abonos) {
    const ft = ftDe(a);
    const g = grupos.find((x) => x.ft === ft);
    if (g) g.abonos.push(a);
    else grupos.push({ ft, abonos: [a] });
  }
  const pagadoBruto = abonos.reduce((n, a) => n + a.neto + a.comision, 0) + b.pagadoSinDetalle;
  const pagadoNeto = abonos.reduce((n, a) => n + a.neto, 0) + b.pagadoSinDetalle;
  const retenido = c.retenido && c.retenido.monto > 0 ? redondear2(c.retenido.monto) : 0;
  const falta = redondear2(b.total - pagadoBruto - retenido); // lo que el cliente todavía no mandó
  const hayCola = falta > 0.5;
  const varias = grupos.length + (hayCola ? 1 : 0) > 1;

  const bloques: BloqueLiquidacion[] = [];
  const comisiones: Liquidacion["comisiones"] = [];
  let n = 0;
  if (b.pagadoSinDetalle > 0.009) {
    n++;
    bloques.push({
      filas: [
        { izquierda: "PAGOS ANTERIORES", concepto: "TOTAL", monto: b.pagadoSinDetalle },
        { izquierda: "Antes del CRM", concepto: `ABONO ${n}`, monto: b.pagadoSinDetalle },
      ],
      saldo: 0,
    });
  }
  for (const g of grupos) {
    const filas: FilaBloque[] = [];
    const bruto = redondear2(g.abonos.reduce((s, a) => s + a.neto + a.comision, 0));
    const titulo = g.ft ? `${varias ? "ANTICIPO " : ""}FT ${g.ft}` : "FT PDTE";
    filas.push({ izquierda: titulo, concepto: "TOTAL", monto: bruto });
    let saldo = bruto;
    for (const a of g.abonos) {
      n++;
      const donde = `${fechaCorta(a.fecha)} ${a.medio}${a.operacion ? ` · OP. ${a.operacion}` : ""}`;
      filas.push({ izquierda: donde, concepto: `ABONO ${n}`, monto: redondear2(a.neto + a.comision) });
      saldo -= a.neto + a.comision;
      if (a.comision > 0) {
        filas.push({ izquierda: `${fechaCorta(a.fecha)} ${a.medio}`, concepto: "COMISIÓN", monto: -redondear2(a.comision) });
        saldo += a.comision;
        comisiones.push({ izquierda: `${fechaCorta(a.fecha)} ${a.medio}`, monto: redondear2(a.comision) });
      }
    }
    bloques.push({ filas, saldo: redondear2(saldo) });
  }

  // Letras: el saldo del cliente en cuotas iguales; el centavo, en la última.
  let letras: LetraLiquidacion[] = [];
  if (c.letras && c.letras.cantidad > 0 && falta > 0.5) {
    const k = Math.min(36, Math.floor(c.letras.cantidad));
    const cuota = redondear2(falta / k);
    const interes = redondear2(Math.max(0, c.letras.interes || 0) / k);
    letras = Array.from({ length: k }, (_, i) => {
      const dias = (c.letras!.cadaDias || 30) * (i + 1);
      return { n: i + 1, giro: c.letras!.giro, vence: sumarDias(c.letras!.giro, dias), dias, monto: i === k - 1 ? redondear2(falta - cuota * (k - 1)) : cuota, interes };
    });
  }

  const filaRetenido = (): FilaBloque | null =>
    c.retenido && retenido > 0
      ? { izquierda: c.retenido.cobrado ? "COBRADA" : "PDTE COBRO", concepto: NOMBRE_RETENIDO[c.retenido.tipo].toUpperCase(), monto: retenido }
      : null;
  const ftSaldo = hayCola ? (c.facturaSaldo ?? "").trim().toUpperCase() : "";
  if (hayCola) {
    // Lo que falta facturar o pagar: «FT CIERRE PDTE / PDTE ABONO n».
    const total = redondear2(falta + retenido);
    const filas: FilaBloque[] = [{ izquierda: `${grupos.length ? "FT CIERRE" : "FT"} ${ftSaldo || "PDTE"}`, concepto: "TOTAL", monto: total }];
    let saldo = total;
    if (letras.length) {
      const suma = redondear2(letras.reduce((s, x) => s + x.monto, 0));
      filas.push({ izquierda: "PDT ABONO", concepto: "ABONO LETRAS", monto: suma });
      saldo -= suma;
    } else {
      filas.push({ izquierda: "PDTE", concepto: `ABONO ${n + 1}`, monto: null });
    }
    const r = filaRetenido();
    if (r) {
      filas.push(r);
      saldo -= retenido;
    }
    bloques.push({ filas, saldo: redondear2(saldo) });
  } else {
    // Pagado con la detracción: va en el último bloque, que sube a la factura entera.
    const r = filaRetenido();
    const ultimo = bloques[bloques.length - 1];
    if (r && ultimo) {
      ultimo.filas[0].monto = redondear2((ultimo.filas[0].monto ?? 0) + retenido);
      ultimo.filas.push(r);
    }
  }

  const saldo = Math.max(0, redondear2(b.total - pagadoNeto - retenido));
  // La comisión la cobra el comercial (gerencia 17-10: «al comercial es el
  // responsable… postventa recibe, solamente para informativo»).
  const sumaComisiones = comisiones.reduce((s, x) => s + x.monto, 0);
  const comisionPendiente = saldo > 0.5 ? redondear2(Math.min(saldo, sumaComisiones)) : 0;

  const cancelado = saldo <= 0.5;
  const estado: Liquidacion["estado"] = cancelado ? "cancelado" : pagadoNeto > 0.009 || retenido > 0 ? "pago_parcial" : "pendiente_pago";
  let rotulo = cancelado ? "OPERACIÓN CANCELADA" : "OPERACIÓN PENDIENTE DE PAGO";
  if (cancelado && c.retenido && !c.retenido.cobrado) rotulo += ` · PENDIENTE COBRO DE ${NOMBRE_RETENIDO[c.retenido.tipo].toUpperCase()}`;
  if (!cancelado && !hayCola && comisionPendiente > 0) rotulo = "OPERACIÓN PENDIENTE: FALTA LA COMISIÓN DEL BANCO";
  if (!cancelado && letras.length) rotulo = `OPERACIÓN CON SALDO EN ${letras.length} LETRA${letras.length === 1 ? "" : "S"}`;
  if (c.ajustes?.rotulo?.trim()) rotulo = c.ajustes.rotulo.trim().toUpperCase();

  // La factura del historial: con un abono sin factura, es un anticipo por
  // facturar (Contabilidad recibe el aviso); si no, la que Finanzas puso en la
  // liquidación, nunca una registrada que dejó en blanco (anulada con nota de
  // crédito, Jhon 19-10). Toda la operación sin factura = por facturar.
  const sinFactura = abonos.some((a) => !ftDe(a));
  const ultimaDeAbono = abonos.length ? ftDe(abonos[abonos.length - 1]) : "";
  const ultima = [...b.facturas].sort((x, y) => y.registradaAt.localeCompare(x.registradaAt))[0]?.numero ?? null;
  const facturaVigente = sinFactura ? null : ftSaldo || ultimaDeAbono || (hayCola ? null : ultima);

  const titulos = bloques.map((x) => x.filas[0].izquierda).filter((t) => t !== "PAGOS ANTERIORES");
  const notas = [
    `FACTURA: ${titulos.length ? titulos.join(" // ") : "PDTE"}`,
    `FORMA DE PAGO: ${b.formaPago ?? "—"}`,
    `COTIZACIÓN: ${b.cotizacion ?? "—"}`,
    `ORDEN DE COMPRA: ${b.ordenCompra?.trim() || "NA"}`,
    `GUÍA: ${c.guia.trim().toUpperCase() || "PDTE"}`,
  ];
  if (c.retenido) notas.push(`OPERACIÓN AFECTA A ${NOMBRE_RETENIDO[c.retenido.tipo].toUpperCase()} (${c.retenido.pct} %)`);

  return { base: b, numero: b.yaHay + 1, fecha, bloques, comisiones, saldo, comisionPendiente, letras, estado, rotulo, facturaVigente, hayCola, notas, notaLibre: c.nota.trim().toUpperCase() };
}

type Fila = Record<string, unknown>;

interface ItemGuardado extends RenglonConIgv {
  descripcion: string;
  bloque?: string | null;
  tipo?: string | null;
}

const normal = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/** Junta del pedido todo lo que la liquidación necesita. null si no existe o no se puede ver. */
export async function cargarBaseLiquidacion(supabase: SupabaseClient, servicioId: string, firmaDe?: string | null): Promise<BaseLiquidacion | null> {
  const { data: s } = await supabase
    .from("servicios_postventa")
    .select(
      "id, cuenta_id, cliente_texto, equipo, moneda, monto, monto_pagado, pct_antes_despacho, credito_dias, forma_pago, tipo_pedido, origen, informe_cierre_id, apertura_empresa, numero_pedido_erp, letras_cantidad, retenido_tipo, retenido_monto, retenido_cobrado_at",
    )
    .eq("id", servicioId)
    .maybeSingle();
  if (!s) return null;
  const f = s as Fila;

  const [inf, abonosQ, facturasQ, liqQ, equiposQ, cuentaQ, firmaQ] = await Promise.all([
    f.informe_cierre_id
      ? supabase
          .from("informes_cierre")
          .select("codigo, serie, cliente_nombre, cliente_doc, orden_compra, presupuesto_ref, modalidad_pago, items, moneda, cotizaciones!informes_cierre_cotizacion_id_fkey(codigo)")
          .eq("id", f.informe_cierre_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("pagos_pedido").select("id, monto, fecha_abono, operacion, medio, descuento_monto, created_at").eq("servicio_id", servicioId),
    // Solo las facturas vigentes: ni notas de crédito ni anuladas (0552, E001-840 de Beneficencia).
    supabase.from("facturas_pedido").select("numero, fecha_emision, created_at").eq("servicio_id", servicioId).eq("tipo", "factura").is("anulada_at", null),
    supabase.from("liquidaciones_pedido").select("id, datos, generada, subida_at").eq("servicio_id", servicioId).order("subida_at", { ascending: false }),
    supabase.from("pedido_equipos").select("descripcion, serie, orden").eq("servicio_id", servicioId).order("orden"),
    f.cuenta_id ? supabase.from("cuentas").select("razon_social, num_doc").eq("id", f.cuenta_id as string).maybeSingle() : Promise.resolve({ data: null }),
    firmaDe ? supabase.from("perfiles").select("nombre, celular, telefono, email_contacto, email_open").eq("id", firmaDe).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const i = inf.data as Fila | null;
  const cuenta = cuentaQ.data as Fila | null;
  const serie = ((i?.serie ?? f.apertura_empresa) as "EFAMEINSA" | "OPEN" | null) ?? "EFAMEINSA";

  const todos = ((i?.items as ItemGuardado[] | null) ?? []).filter((x) => Number(x.cantidad) > 0);
  const items = todos.filter((x) => x.bloque !== "gratuito");
  const gratis = todos.filter((x) => x.bloque === "gratuito");
  let renglones: RenglonLiquidacion[];
  let totales: { subtotal: number; igv: number; total: number };
  if (items.length) {
    totales = totalesConIgv(items.map((x) => ({ cantidad: Number(x.cantidad), precio_unitario: Number(x.precio_unitario), precio_con_igv: x.precio_con_igv })));
    // Lo vendido primero y, al final, lo que se entrega gratis (no suma).
    renglones = [...items, ...gratis].map((x) => ({
      cantidad: Number(x.cantidad),
      descripcion: String(x.descripcion ?? "").trim(),
      precioUnitario: Number(x.precio_unitario),
      importe: redondear2(Number(x.cantidad) * Number(x.precio_unitario)),
      series: [],
      ...(x.bloque === "gratuito" ? { gratuito: true } : {}),
    }));
  } else {
    // Sin cierre en el CRM (pedido del Excel): un renglón con el equipo y el monto del pedido.
    const total = redondear2(Number(f.monto ?? 0));
    const neto = redondear2(total / 1.18);
    renglones = [{ cantidad: 1, descripcion: String(f.equipo ?? "Según pedido").trim(), precioUnitario: neto, importe: neto, series: [] }];
    totales = { subtotal: neto, igv: redondear2(total - neto), total };
  }
  // Cada serie, bajo su equipo (la primera línea del pedido coincide con la del renglón); si no se ubica, aparte.
  const sueltas: string[] = [];
  for (const e of (equiposQ.data ?? []) as Fila[]) {
    const sn = String(e.serie ?? "").trim();
    if (!sn) continue;
    const cabeza = normal(String(e.descripcion ?? "").split("\n")[0]);
    const vendidos = renglones.filter((x) => !x.gratuito);
    const r =
      vendidos.length === 1
        ? vendidos[0]
        : vendidos.find((x) => {
            const rc = normal(x.descripcion.split("\n")[0]);
            return cabeza && rc && (rc === cabeza || rc.includes(cabeza) || cabeza.includes(rc));
          });
    if (r) r.series.push(sn);
    else sueltas.push(`${String(e.descripcion ?? "").split("\n")[0].trim()} · SERIE: ${sn}`);
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
  const modalidad = ((i?.modalidad_pago as string[] | null) ?? []).join(" / ");
  const condicion = textoCondicionPago({ pct_antes_despacho: f.pct_antes_despacho as number | null, credito_dias: f.credito_dias as number | null });
  const tipoPedido = String(f.tipo_pedido ?? "");
  const p = firmaQ.data as Fila | null;

  return {
    servicioId,
    empresa: serie,
    cliente: String((cuenta?.razon_social as string | null) ?? (i?.cliente_nombre as string | null) ?? f.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, ""),
    clienteDoc: (i?.cliente_doc as string | null) ?? (cuenta?.num_doc as string | null) ?? null,
    pedido: (f.numero_pedido_erp as string | null) ?? (i?.codigo as string | null) ?? "—",
    moneda: (f.moneda as string | null) ?? (i?.moneda as string | null) ?? "USD",
    renglones,
    series: sueltas,
    gratuito: valorGratuito(renglones),
    subtotal: totales.subtotal,
    igv: redondear2(totalPedido - totales.subtotal),
    total: totalPedido,
    abonos,
    pagadoSinDetalle,
    facturas: ((facturasQ.data ?? []) as Fila[]).map((x) => ({ numero: String(x.numero), fechaEmision: String(x.fecha_emision), registradaAt: String(x.created_at) })),
    // La forma de pago escrita en el pedido manda; si no hay, la del cierre o la condición.
    formaPago: (f.forma_pago as string | null)?.trim() || modalidad || condicion || null,
    // «Presu_956-26» → «956-26», como lo escribe Finanzas.
    cotizacion: (((i?.cotizaciones as { codigo?: string } | null)?.codigo ?? (i?.presupuesto_ref as string | null)) || "").replace(/^presu_?/i, "") || null,
    ordenCompra: (i?.orden_compra as string | null) ?? null,
    letrasCantidad: (f.letras_cantidad as number | null) ?? null,
    esServicio: /servicio|mantenimiento/i.test(tipoPedido) || /servicio|mantenimiento/i.test(String(f.equipo ?? "")),
    anteriores: (ultimaGenerada?.datos as Complementos | null) ?? null,
    anterioresAt: (ultimaGenerada?.subida_at as string | undefined) ?? null,
    yaHay: liqs.length,
    retenidoGuardado:
      f.retenido_tipo && Number(f.retenido_monto ?? 0) > 0
        ? { tipo: f.retenido_tipo as TipoRetenido, monto: Number(f.retenido_monto), cobrado: f.retenido_cobrado_at != null }
        : null,
    firma: p
      ? {
          nombre: String(p.nombre ?? ""),
          celular: ((p.celular ?? p.telefono) as string | null) ?? null,
          correo: ((serie === "OPEN" ? (p.email_open ?? p.email_contacto) : p.email_contacto) as string | null) ?? null,
        }
      : null,
  };
}
