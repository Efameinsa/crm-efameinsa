import { describe, expect, it } from "vitest";
import { aplicarAjustes, calcularLiquidacion, complementosIniciales, pctAdelanto, type BaseLiquidacion, type Complementos } from "./liquidacion-automatica";

// Los cuatro Excel de Jhon (reunión 17-10): contado, anticipos con comisión,
// detracción de un servicio y saldo en letras.
const base = (o: Partial<BaseLiquidacion>): BaseLiquidacion => ({
  servicioId: "s1",
  empresa: "EFAMEINSA",
  cliente: "CLIENTE SAC",
  clienteDoc: "20600000001",
  pedido: "PED-0001-2026",
  moneda: "USD",
  renglones: [{ cantidad: 1, descripcion: "LAVADORA", precioUnitario: 1000, importe: 1000, series: [] }],
  series: [],
  gratuito: 0,
  subtotal: 1000,
  igv: 180,
  total: 1180,
  abonos: [],
  pagadoSinDetalle: 0,
  facturas: [],
  formaPago: "CONTADO",
  cotizacion: "840-26",
  ordenCompra: null,
  letrasCantidad: null,
  esServicio: false,
  anteriores: null,
  yaHay: 0,
  retenidoGuardado: null,
  firma: null,
  ...o,
});
const sin: Complementos = { facturaDeAbono: {}, retenido: null, letras: null, guia: "", nota: "" };
const abono = (id: string, neto: number, comision = 0, createdAt = "2026-10-01T10:00:00Z") => ({
  id, fecha: createdAt.slice(0, 10), medio: "BCP ME", operacion: `OP${id}`, neto, comision, createdAt,
});

describe("liquidación automática (0534)", () => {
  it("contado normal: un abono por el total y su factura → cancelada", () => {
    const b = base({ abonos: [abono("a", 1180)], facturas: [{ numero: "E001-816", fechaEmision: "2026-10-01", registradaAt: "2026-10-01T12:00:00Z" }] });
    const l = calcularLiquidacion(b, complementosIniciales(b, "2026-10-17"), "2026-10-17");
    expect(l.estado).toBe("cancelado");
    expect(l.rotulo).toBe("OPERACIÓN CANCELADA");
    expect(l.facturaVigente).toBe("E001-816");
    expect(l.numero).toBe(1);
  });

  it("sin abonos ni factura → pendiente de pago y factura pendiente", () => {
    const l = calcularLiquidacion(base({}), sin, "2026-10-17");
    expect(l.estado).toBe("pendiente_pago");
    expect(l.facturaVigente).toBeNull();
    expect(l.saldo).toBe(1180);
  });

  it("anticipos con comisión: el saldo es la comisión y la cobra el comercial", () => {
    const b = base({ abonos: [abono("a", 500, 0, "2026-10-01T10:00:00Z"), abono("b", 100, 0, "2026-10-02T10:00:00Z"), abono("c", 540, 40, "2026-10-03T10:00:00Z")], yaHay: 2 });
    const l = calcularLiquidacion(b, sin, "2026-10-17");
    expect(l.saldo).toBe(40);
    expect(l.comisionPendiente).toBe(40);
    expect(l.rotulo).toContain("COMISIÓN");
    expect(l.numero).toBe(3);
    // Como en el Excel: el abono por lo que pagó el cliente y la comisión aparte, en su bloque.
    const filas = l.bloques.flatMap((x) => x.filas);
    expect(filas.find((f) => f.concepto === "ABONO 3")?.monto).toBe(580);
    expect(filas.find((f) => f.concepto === "COMISIÓN")?.monto).toBe(-40);
  });

  it("un abono después de la última factura es un anticipo por facturar", () => {
    const b = base({
      abonos: [abono("a", 500, 0, "2026-10-01T10:00:00Z"), abono("b", 100, 0, "2026-10-05T10:00:00Z")],
      facturas: [{ numero: "E001-826", fechaEmision: "2026-10-02", registradaAt: "2026-10-02T10:00:00Z" }],
    });
    const c = complementosIniciales(b, "2026-10-17");
    expect(c.facturaDeAbono).toEqual({ a: "E001-826", b: "" });
    expect(calcularLiquidacion(b, c, "2026-10-17").facturaVigente).toBeNull();
  });

  it("crédito sin abonos: la factura emitida va al saldo y al historial (Jhon 17-10)", () => {
    const b = base({ facturas: [{ numero: "E001-840", fechaEmision: "2026-10-16", registradaAt: "2026-10-16T23:22:00Z" }] });
    const c = complementosIniciales(b, "2026-10-17");
    expect(c.facturaSaldo).toBe("E001-840");
    const l = calcularLiquidacion(b, c, "2026-10-17");
    expect(l.hayCola).toBe(true);
    expect(l.bloques[0].filas[0].izquierda).toBe("FT E001-840");
    expect(l.facturaVigente).toBe("E001-840");
    expect(l.notas[0]).toBe("FACTURA: FT E001-840");
    // Vacío = sigue pendiente.
    expect(calcularLiquidacion(b, { ...c, facturaSaldo: "" }, "2026-10-17").bloques[0].filas[0].izquierda).toBe("FT PDTE");
  });

  it("factura del saldo dejada en blanco (anulada con nota de crédito): queda pendiente y no vuelve sola (Jhon 19-10)", () => {
    const ft = { numero: "E001-840", fechaEmision: "2026-10-16", registradaAt: "2026-10-16T23:22:00Z" };
    const b = base({ facturas: [ft] });
    const l = calcularLiquidacion(b, { ...sin, facturaSaldo: "" }, "2026-10-19");
    expect(l.bloques[0].filas[0].izquierda).toBe("FT PDTE");
    expect(l.facturaVigente).toBeNull();
    expect(l.notas[0]).toBe("FACTURA: FT PDTE");
    // La siguiente liquidación la trae en blanco…
    const b2 = base({ facturas: [ft], anteriores: { ...sin, facturaSaldo: "" }, anterioresAt: "2026-10-19T13:58:00Z" });
    expect(complementosIniciales(b2, "2026-10-19").facturaSaldo).toBe("");
    // …hasta que Contabilidad registra la nueva.
    const b3 = { ...b2, facturas: [ft, { numero: "E001-861", fechaEmision: "2026-10-19", registradaAt: "2026-10-19T15:00:00Z" }] };
    expect(complementosIniciales(b3, "2026-10-19").facturaSaldo).toBe("E001-861");
  });

  it("detracción: pagó el 88 % y el resto retenido → cancelada, pendiente cobro de la detracción", () => {
    const b = base({ esServicio: true, abonos: [abono("a", 1038.4)] });
    const l = calcularLiquidacion(b, { ...sin, retenido: { tipo: "detraccion", pct: 12, monto: 141.6, cobrado: false } }, "2026-10-17");
    expect(l.saldo).toBe(0);
    expect(l.estado).toBe("cancelado");
    expect(l.rotulo).toBe("OPERACIÓN CANCELADA · PENDIENTE COBRO DE DETRACCIÓN");
    // Un solo bloque, por la factura entera, con la detracción adentro.
    expect(l.bloques).toHaveLength(1);
    expect(l.bloques[0].filas[0].monto).toBe(1180);
    expect(l.bloques[0].saldo).toBe(0);
  });

  it("letras: el saldo se reparte y el centavo va en la última", () => {
    const b = base({ total: 1000, abonos: [abono("a", 400)] });
    const l = calcularLiquidacion(b, { ...sin, letras: { cantidad: 3, cadaDias: 30, giro: "2026-05-21", interes: 0 } }, "2026-10-17");
    expect(l.letras.map((x) => x.monto)).toEqual([200, 200, 200]);
    expect(l.letras[1].vence).toBe("2026-07-20");
    expect(l.rotulo).toBe("OPERACIÓN CON SALDO EN 3 LETRAS");
    expect(l.bloques.at(-1)?.saldo).toBe(0);
    const l2 = calcularLiquidacion(base({ total: 100 }), { ...sin, letras: { cantidad: 3, cadaDias: 30, giro: "2026-05-21", interes: 0 } }, "2026-10-17");
    expect(l2.letras.reduce((n, x) => n + x.monto, 0)).toBeCloseTo(100, 2);
  });

  it("ajustes: el cliente y el recuadro escritos a mano mandan; los renglones editados recalculan el total", () => {
    const b = base({});
    const l = calcularLiquidacion(b, { ...sin, ajustes: { cliente: "OTRO NOMBRE SAC", rotulo: "operación en revisión", fecha: "2026-10-01" } }, "2026-10-17");
    expect(l.base.cliente).toBe("OTRO NOMBRE SAC");
    expect(l.rotulo).toBe("OPERACIÓN EN REVISIÓN");
    expect(l.fecha).toBe("2026-10-01");
    const a = aplicarAjustes(b, { renglones: [{ cantidad: 2, descripcion: "X", precioUnitario: 100, importe: 0, series: [" A1 ", ""] }] });
    expect(a.subtotal).toBe(200);
    expect(a.total).toBe(236);
    expect(a.renglones[0].series).toEqual(["A1"]);
    // Vacío = lo del CRM.
    expect(aplicarAjustes(b, { cliente: "  " }).cliente).toBe("CLIENTE SAC");
  });

  it("entrega gratuita (buzón Jhon 19-10): sale en el detalle y aparte, sin sumar a la base, al IGV ni al total", () => {
    const b = base({
      renglones: [
        { cantidad: 1, descripcion: "LAVADORA", precioUnitario: 13999, importe: 13999, series: [] },
        { cantidad: 1, descripcion: "BONIFICACION GRATUITA\nKIT DE MANGUERAS", precioUnitario: 399, importe: 399, series: [], gratuito: true },
      ],
      gratuito: 399,
      subtotal: 13999,
      igv: 2519.82,
      total: 16518.82,
      abonos: [abono("a", 16518.82)],
    });
    const l = calcularLiquidacion(b, complementosIniciales(b, "2026-10-19"), "2026-10-19");
    expect(l.base.renglones).toHaveLength(2);
    expect(l.base.gratuito).toBe(399);
    expect(l.base.total).toBe(16518.82);
    expect(l.estado).toBe("cancelado");
    // Editando las líneas a mano, la gratuita sigue sin sumar.
    const e = aplicarAjustes(b, { renglones: b.renglones.map((r) => ({ ...r, precioUnitario: r.gratuito ? 450 : r.precioUnitario })) });
    expect(e.subtotal).toBe(13999);
    expect(e.igv).toBe(2519.82);
    expect(e.total).toBe(16518.82);
    expect(e.gratuito).toBe(450);
  });
});

// Buzón Jhon 21-10 (FAMILY FARMS PED-0037-2026, 50 % ADELANTO + 50 % CRÉDITO 7 DÍAS):
// al facturar el anticipo solo va ese monto; el saldo, en el cuadro siguiente.
describe("factura solo del anticipo y observación para facturación", () => {
  const ff = base({ total: 2950, subtotal: 2500, igv: 450, pctAdelanto: 50, formaPago: "50% ADELANTO + 50% CREDITO 7 DIAS" });
  it("sin abonos y 50 % de adelanto: sugiere facturar la mitad", () => {
    const c = complementosIniciales(ff, "2026-10-21");
    expect(c.anticipo).toBe(1475);
    const l = calcularLiquidacion(ff, c, "2026-10-21");
    expect(l.bloques).toHaveLength(2);
    expect(l.bloques[0].filas[0]).toEqual({ izquierda: "FT ANTICIPO PDTE", concepto: "TOTAL", monto: 1475 });
    expect(l.bloques[0].filas[1].concepto).toBe("ABONO 1");
    expect(l.bloques[1].filas[0]).toEqual({ izquierda: "FT CIERRE PDTE", concepto: "TOTAL", monto: 1475 });
    expect(l.bloques[1].filas[1].concepto).toBe("ABONO 2");
    expect(l.porCobrarAhora).toBe(1475);
    expect(l.saldo).toBe(2950);
    expect(l.observacionSugerida).toBe("anticipo");
    expect(l.observacion).toContain("OPERACIÓN POR ANTICIPO: FACTURAR US$ 1,475.00 DE US$ 2,950.00");
    expect(l.notas[0]).toBe("FACTURA: FT ANTICIPO PDTE // FT CIERRE PDTE");
  });
  it("la factura del anticipo va en su bloque y es la vigente", () => {
    const l = calcularLiquidacion(ff, { ...complementosIniciales(ff, "2026-10-21"), facturaSaldo: "E001-900" }, "2026-10-21");
    expect(l.bloques[0].filas[0].izquierda).toBe("FT ANTICIPO E001-900");
    expect(l.bloques[1].filas[0].izquierda).toBe("FT CIERRE PDTE");
    expect(l.facturaVigente).toBe("E001-900");
  });
  it("«Todo» deja un solo bloque, como antes", () => {
    const l = calcularLiquidacion(ff, { ...sin, anticipo: null }, "2026-10-21");
    expect(l.bloques).toHaveLength(1);
    expect(l.bloques[0].filas[0].monto).toBe(2950);
    expect(l.observacion).toBe("");
  });
  it("con el anticipo ya abonado y facturado: sugiere cierre de anticipo, sin volver a partir", () => {
    const b = { ...ff, abonos: [abono("a", 1475)], facturas: [{ numero: "E001-900", fechaEmision: "2026-10-22", registradaAt: "2026-10-22T12:00:00Z" }] };
    const c = complementosIniciales(b, "2026-10-23");
    expect(c.anticipo).toBeNull();
    const l = calcularLiquidacion(b, { ...c, facturaSaldo: "" }, "2026-10-23");
    expect(l.bloques.map((x) => x.filas[0].izquierda)).toEqual(["ANTICIPO FT E001-900", "FT CIERRE PDTE"]);
    expect(l.observacionSugerida).toBe("cierre_anticipo");
    expect(l.observacion).toBe("CIERRE DE ANTICIPO: FACTURAR EL SALDO DE US$ 1,475.00 (EL ANTICIPO VA EN FT E001-900)");
  });
  it("se puede quitar la observación o escribir otra", () => {
    const c = complementosIniciales(ff, "2026-10-21");
    expect(calcularLiquidacion(ff, { ...c, observacion: { tipo: null } }, "2026-10-21").observacion).toBe("");
    expect(calcularLiquidacion(ff, { ...c, observacion: { tipo: null, texto: "emitir con la oc 55" } }, "2026-10-21").observacion).toBe("EMITIR CON LA OC 55");
  });
  it("las letras van sobre el saldo que queda después del anticipo", () => {
    const l = calcularLiquidacion(ff, { ...sin, anticipo: 950, letras: { cantidad: 2, cadaDias: 30, giro: "2026-10-21", interes: 0 } }, "2026-10-21");
    expect(l.letras.map((x) => x.monto)).toEqual([1000, 1000]);
  });
  it("el % sale del pedido o de la forma de pago", () => {
    expect(pctAdelanto(50, null)).toBe(50);
    expect(pctAdelanto(100, "20% ADELANTO // 80% FINALES DE MES")).toBe(20);
    expect(pctAdelanto(100, "CONTADO")).toBeNull();
  });
});
