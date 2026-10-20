import { describe, expect, it } from "vitest";
import { facturasVigentes, liquidacionPorFacturar, type DocumentosDeFinanzas, type FacturaFirmada, type LiquidacionFirmada } from "./documentos-finanzas";

const liq = (subidaAt: string, facturaNumero: string | null): LiquidacionFirmada => ({
  id: subidaAt, nombre: "liq.pdf", url: null, estadoPago: "pago_parcial", facturaNumero, nota: null, subidaAt, subidaPor: null,
});
const fac = (numero: string, registradaAt: string): FacturaFirmada => ({
  id: numero, numero, fechaEmision: registradaAt.slice(0, 10), url: null, nombre: null, nota: null, registradaAt, registradaPor: null,
  tipo: "factura", anulaA: null, anuladaAt: null, motivo: null,
});
// Más nueva primero, como las devuelve documentosDeFinanzas.
const docs = (liquidaciones: LiquidacionFirmada[], facturas: FacturaFirmada[]): DocumentosDeFinanzas => ({ liquidaciones, facturas });

describe("liquidacionPorFacturar", () => {
  it("sin factura: la vigente espera a Facturación", () => {
    expect(liquidacionPorFacturar(docs([liq("2026-10-01T17:00:00Z", null)], []))?.subidaAt).toBe("2026-10-01T17:00:00Z");
  });
  it("PRODECO: 2.º anticipo subido después de la factura del 1.º", () => {
    const d = docs([liq("2026-10-14T19:32:55Z", null), liq("2026-10-01T17:59:53Z", "E001-826")], [fac("E001-826", "2026-10-10T16:18:37Z")]);
    expect(liquidacionPorFacturar(d)?.subidaAt).toBe("2026-10-14T19:32:55Z");
  });
  it("factura registrada después de la liquidación pendiente: le toca a Finanzas poner el número, no a Facturación", () => {
    const d = docs([liq("2026-10-01T17:59:53Z", null)], [fac("E001-826", "2026-10-10T16:18:37Z")]);
    expect(liquidacionPorFacturar(d)).toBeNull();
  });
  it("la vigente ya trae su número", () => {
    const d = docs([liq("2026-10-14T19:32:55Z", "E001-900")], [fac("E001-826", "2026-10-10T16:18:37Z")]);
    expect(liquidacionPorFacturar(d)).toBeNull();
  });
  it("sin liquidaciones no hay nada", () => {
    expect(liquidacionPorFacturar(undefined)).toBeNull();
    expect(liquidacionPorFacturar(docs([], []))).toBeNull();
  });
});

// NOTA DE CRÉDITO (0552, Beneficencia de Huancayo: E001-840 anulada, E001-842 vigente).
describe("facturas anuladas con nota de crédito", () => {
  const anulada: FacturaFirmada = { ...fac("E001-840", "2026-10-16T15:00:00Z"), anuladaAt: "2026-10-20T15:00:00Z", motivo: "en dólares" };
  const nc: FacturaFirmada = { ...fac("FC01-1", "2026-10-20T15:00:00Z"), tipo: "nota_credito", anulaA: "E001-840" };
  const buena = fac("E001-842", "2026-10-19T15:00:00Z");
  it("solo cuentan las facturas vigentes", () => {
    expect(facturasVigentes(docs([], [anulada, nc, buena])).map((f) => f.numero)).toEqual(["E001-842"]);
  });
  it("con la factura anulada y sin la correcta, el pedido vuelve a «Por facturar»", () => {
    expect(facturasVigentes(docs([], [anulada, nc]))).toHaveLength(0);
    const l = liq("2026-10-20T16:00:00Z", null);
    expect(liquidacionPorFacturar(docs([l], [anulada, nc]))).toBe(l);
  });
  it("sin documentos, no hay vigentes", () => {
    expect(facturasVigentes(undefined)).toEqual([]);
  });
});
