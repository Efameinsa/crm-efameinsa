import { describe, expect, it } from "vitest";
import {
  codigoCentralDesdeCodMkt,
  codigoProDeCentral,
  excelFechaAISO,
  horaDesdeCelda,
  parseMonto,
} from "./parseo-historico";

describe("excelFechaAISO", () => {
  it("convierte un serial Excel real a ISO", () => {
    expect(excelFechaAISO(46000)).toBe("2025-12-09");
  });

  it("serial <= 0 o no numérico → null", () => {
    expect(excelFechaAISO(0)).toBeNull();
    expect(excelFechaAISO(-5)).toBeNull();
    expect(excelFechaAISO("2026-08-19")).toBeNull();
    expect(excelFechaAISO(null)).toBeNull();
  });
});

describe("horaDesdeCelda", () => {
  it("texto con am/pm", () => {
    expect(horaDesdeCelda("10:13 am")).toBe("10:13");
    expect(horaDesdeCelda("2:22 pm")).toBe("14:22");
    expect(horaDesdeCelda("2:22 pm ")).toBe("14:22");
  });

  it("12 am es medianoche (00:xx), 12 pm sigue siendo mediodía", () => {
    expect(horaDesdeCelda("12:00 am")).toBe("00:00");
    expect(horaDesdeCelda("12:30 pm")).toBe("12:30");
  });

  it("serial Excel (fracción de día)", () => {
    expect(horaDesdeCelda(0.5)).toBe("12:00");
    expect(horaDesdeCelda(0)).toBeNull(); // 0 no es fracción de día (no > 0)
  });

  it("0.99999 no redondea a 24:00 (bug real corregido: reventaba el timestamptz)", () => {
    const r = horaDesdeCelda(0.99999);
    expect(r).not.toBeNull();
    const [h, m] = r!.split(":").map(Number);
    expect(h).toBeLessThan(24);
    expect(m).toBeLessThan(60);
  });

  it("celda sucia tipo decimal suelto ('4.63') → null, no '04:63' (bug real que reventó el import)", () => {
    expect(horaDesdeCelda("4.63")).toBeNull();
  });

  it("hora u minuto fuera de rango → null", () => {
    expect(horaDesdeCelda("25:00")).toBeNull();
    expect(horaDesdeCelda("10:99")).toBeNull();
  });

  it("null/undefined → null", () => {
    expect(horaDesdeCelda(null)).toBeNull();
    expect(horaDesdeCelda(undefined)).toBeNull();
  });

  it("texto irreconocible → null", () => {
    expect(horaDesdeCelda("no es hora")).toBeNull();
  });
});

describe("parseMonto", () => {
  it("número plano → USD", () => {
    expect(parseMonto(3850)).toEqual({ monto: 3850, moneda: "USD" });
  });

  it("dólares con distintos prefijos", () => {
    expect(parseMonto("US$ 1,905.93")).toEqual({ monto: 1905.93, moneda: "USD" });
    expect(parseMonto("$ 3,850.00")).toEqual({ monto: 3850, moneda: "USD" });
    expect(parseMonto("USD 500")).toEqual({ monto: 500, moneda: "USD" });
  });

  it("soles con prefijo S/", () => {
    expect(parseMonto("S/. 983.00")).toEqual({ monto: 983, moneda: "PEN" });
    expect(parseMonto("S/ 1200")).toEqual({ monto: 1200, moneda: "PEN" });
  });

  it("separador decimal ambiguo: coma como miles cuando el punto es el decimal", () => {
    expect(parseMonto("1,905.93")).toEqual({ monto: 1905.93, moneda: "USD" });
  });

  it("varios puntos: se tratan como miles, excepto el último (caso real '2.238.87')", () => {
    expect(parseMonto("2.238.87")).toEqual({ monto: 2238.87, moneda: "USD" });
  });

  it("coma como decimal cuando solo hay una coma con 2 dígitos después", () => {
    expect(parseMonto("3850,00")).toEqual({ monto: 3850, moneda: "USD" });
  });

  it("coma como separador de miles cuando no tiene forma de decimal", () => {
    expect(parseMonto("3,850")).toEqual({ monto: 3850, moneda: "USD" });
  });

  it("número de presupuesto colado en la celda ('560-21') → null, no un monto inventado", () => {
    expect(parseMonto("560-21")).toEqual({ monto: null, moneda: null });
  });

  it("cero o negativo no es un monto válido", () => {
    expect(parseMonto("0")).toEqual({ monto: null, moneda: null });
    expect(parseMonto("-100")).toEqual({ monto: null, moneda: null });
  });

  it("vacío/null/basura → null", () => {
    expect(parseMonto(null)).toEqual({ monto: null, moneda: null });
    expect(parseMonto("")).toEqual({ monto: null, moneda: null });
    expect(parseMonto("   ")).toEqual({ monto: null, moneda: null });
    expect(parseMonto("no es un monto")).toEqual({ monto: null, moneda: null });
  });

  it("redondea a 2 decimales", () => {
    expect(parseMonto("100.999")).toEqual({ monto: 101, moneda: "USD" });
  });
});

describe("codigoCentralDesdeCodMkt", () => {
  it("formatos con espacio o sin espacio", () => {
    expect(codigoCentralDesdeCodMkt("PRO 11591")).toBe("PRO11591");
    expect(codigoCentralDesdeCodMkt("PRO726")).toBe("PRO726");
  });

  it("O confundida con 0 en el código", () => {
    expect(codigoCentralDesdeCodMkt("PR0026")).toBe("PRO26");
  });

  it("sin match → null", () => {
    expect(codigoCentralDesdeCodMkt(null)).toBeNull();
    expect(codigoCentralDesdeCodMkt("")).toBeNull();
    expect(codigoCentralDesdeCodMkt("sin codigo")).toBeNull();
  });

  it("con guion (formato que este parser NO soporta, a diferencia de codigoProDeCentral) da un resultado distinto al esperado — documentado, no un bug nuevo", () => {
    // COD_MKT (hoja de comerciales) no trae guiones en la práctica; si algún
    // día aparece uno, este parser NO lo trata como separador (\s* solo
    // reconoce espacios), así que "pro-220" da PRO0, no PRO220.
    expect(codigoCentralDesdeCodMkt("pro-220")).toBe("PRO0");
  });
});

describe("codigoProDeCentral", () => {
  it("formato estándar del maestro de Central", () => {
    expect(codigoProDeCentral("PRO00123")).toBe("PRO123");
    expect(codigoProDeCentral("PRO-220")).toBe("PRO220");
  });

  it("minúsculas y guion", () => {
    expect(codigoProDeCentral("pro-220")).toBe("PRO220");
  });

  it("el mismo código sin sufijo de año da el mismo resultado (el sufijo lo agrega el importador aparte)", () => {
    expect(codigoProDeCentral("PRO220")).toBe("PRO220");
  });

  it("sin match → null", () => {
    expect(codigoProDeCentral(null)).toBeNull();
    expect(codigoProDeCentral("ASIGNADO A: C5")).toBeNull();
  });
});
