import { describe, expect, it } from "vitest";
import { importeConIgv, netoDeBruto, totalesConIgv } from "./igv";

// El caso del 14-09: 2 lavadoras a 3.600 y una secadora a 1.600, con IGV.
// A mano salía 8.799,99 (un dedazo en el neto). Acá tiene que dar 8.800,00.
describe("precio pactado con IGV (0233)", () => {
  it("el neto que se imprime es el bruto entre 1,18 a dos decimales", () => {
    expect(netoDeBruto(3600)).toBe(3050.85);
    expect(netoDeBruto(1600)).toBe(1355.93);
    expect(netoDeBruto(1000)).toBe(847.46);
  });

  it("el total con IGV es exacto aunque el neto redondee", () => {
    const t = totalesConIgv([
      { cantidad: 2, precio_unitario: netoDeBruto(3600), precio_con_igv: 3600 },
      { cantidad: 1, precio_unitario: netoDeBruto(1600), precio_con_igv: 1600 },
    ]);
    expect(t.total).toBe(8800);
    expect(t.subtotal).toBe(7457.63);
    expect(t.igv).toBe(1342.37);
    // Lo impreso cuadra entre sí: subtotal + IGV = total, centavo por centavo.
    expect(Math.round((t.subtotal + t.igv) * 100) / 100).toBe(t.total);
  });

  it("dos lavadoras a 3.600 con IGV dan 7.200, no 7.200,01", () => {
    expect(totalesConIgv([{ cantidad: 2, precio_unitario: 3050.85, precio_con_igv: 3600 }]).total).toBe(7200);
    // Sin el precio bruto guardado, el neto redondeado × cantidad × 1,18
    // arrastra el centavo: es el error que la columna nueva existe para evitar.
    expect(totalesConIgv([{ cantidad: 2, precio_unitario: 3050.85 }]).total).toBe(7200.01);
    expect(totalesConIgv([{ cantidad: 1, precio_unitario: 847.46, precio_con_igv: 1000 }]).total).toBe(1000);
  });

  it("un documento sin renglones pactados se calcula como siempre", () => {
    const t = totalesConIgv([
      { cantidad: 2, precio_unitario: 3950 },
      { cantidad: 1, precio_unitario: 2090 },
    ]);
    expect(t.subtotal).toBe(9990);
    expect(t.igv).toBe(1798.2);
    expect(t.total).toBe(11788.2);
  });

  it("mezcla renglones pactados con IGV y renglones netos", () => {
    const t = totalesConIgv([
      { cantidad: 2, precio_unitario: 3050.85, precio_con_igv: 3600 },
      { cantidad: 1, precio_unitario: 200 },
    ]);
    expect(importeConIgv({ cantidad: 1, precio_unitario: 200 })).toBe(236);
    expect(t.total).toBe(7436);
    expect(t.subtotal).toBe(6301.7);
    expect(t.igv).toBe(1134.3);
  });
});
