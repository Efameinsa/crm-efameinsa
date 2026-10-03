import { describe, expect, it } from "vitest";
import { totalesConIgv } from "@/lib/igv";
import { renglonEnSoles } from "@/lib/moneda-impresa";

// Presu_982-26 (Gabriela, 01-10-2026): cuatro mantenimientos escritos en soles
// con cambio 3.63. Antes salían 3,949.98 y 3,500.01 y el total no cuadraba.
const TC = 3.63;
const escritos = [4500, 4500, 3950, 3500];
const renglones = escritos.map((s) => ({
  cantidad: 1,
  precio_unitario: Math.round((s / TC) * 100) / 100,
  precio_con_igv: null,
  precio_impreso: s,
}));

describe("precio escrito en soles (0366)", () => {
  it("sale tal como se escribió", () => {
    expect(renglones.map((r) => renglonEnSoles(r, TC).precio_unitario)).toEqual(escritos);
  });

  it("los totales en soles cuadran: 16,450 + 2,961 = 19,411", () => {
    const t = totalesConIgv(renglones.map((r) => renglonEnSoles(r, TC)));
    expect(t).toEqual({ subtotal: 16450, igv: 2961, total: 19411 });
  });

  it("sin lo escrito se convierte como antes (lo emitido no cambia)", () => {
    const viejo = { cantidad: 1, precio_unitario: 1088.15, precio_con_igv: null };
    expect(renglonEnSoles(viejo, TC).precio_unitario).toBe(3949.98);
  });

  it("con IGV: lo escrito es el bruto y el neto se calcula", () => {
    const r = renglonEnSoles({ cantidad: 2, precio_unitario: 840.55, precio_con_igv: 991.85, precio_impreso: 3600 }, TC);
    expect(r.precio_con_igv).toBe(3600);
    expect(totalesConIgv([r]).total).toBe(7200);
  });
});
