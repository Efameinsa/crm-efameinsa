import { describe, expect, it } from "vitest";
import { avisoCondicionPago, saldoAlCambiarForma } from "./condicion-pago-cotizacion";

describe("saldoAlCambiarForma", () => {
  it("Contado borra el saldo que puso la lista", () => {
    expect(saldoAlCambiarForma("Contado", "70 % antes del despacho")).toBe("");
  });
  it("50 % con la O/C trae su 50 %", () => {
    expect(saldoAlCambiarForma("50 % con la O/C", "70 % antes del despacho")).toBe("50 % antes del despacho");
    expect(saldoAlCambiarForma("50 % con la O/C", "")).toBe("50 % antes del despacho");
  });
  it("respeta un saldo escrito a mano", () => {
    expect(saldoAlCambiarForma("Contado", "Saldo contra factura a 7 días")).toBe("Saldo contra factura a 7 días");
  });
  it("«Otra…» (forma fuera de la lista) no toca el saldo", () => {
    expect(saldoAlCambiarForma("", "70 % antes del despacho")).toBe("70 % antes del despacho");
  });
});

describe("avisoCondicionPago", () => {
  it("avisa si quedó lo que viene por defecto (caso 990-26)", () => {
    expect(avisoCondicionPago("30 % con la O/C", "70 % antes del despacho")).toMatch(/por defecto/);
  });
  it("avisa la contradicción contado + saldo en %", () => {
    expect(avisoCondicionPago("Contado", "70 % antes del despacho")).toMatch(/contradicen/);
    expect(avisoCondicionPago("Crédito 30 días", "50 % antes del despacho")).toMatch(/contradicen/);
  });
  it("avisa si no lleva forma de pago", () => {
    expect(avisoCondicionPago("", "")).toMatch(/No lleva/);
  });
  it("calla con condiciones coherentes", () => {
    expect(avisoCondicionPago("Contado", "")).toBeNull();
    expect(avisoCondicionPago("50 % con la O/C", "50 % antes del despacho")).toBeNull();
    expect(avisoCondicionPago("30 % con la O/C", "70 % contra entrega")).toBeNull();
  });
});
