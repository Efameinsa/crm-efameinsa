import { describe, expect, it } from "vitest";
import { aplicarAjustes, calcularLiquidacion, complementosIniciales, type BaseLiquidacion, type Complementos } from "./liquidacion-automatica";

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
});
