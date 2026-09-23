import { describe, expect, it } from "vitest";
import { fechaCalendario, fechaCalendarioLarga, fechaHoraLima, fechaLima, fechaConHora } from "./fechas";

describe("fechaCalendario (columna date, sin zona horaria)", () => {
  it("formatea sin correrse un día", () => {
    expect(fechaCalendario("2026-08-16")).toBe("16/08/2026");
  });

  it("acepta el prefijo ISO con hora (timestamp que en realidad es un date)", () => {
    expect(fechaCalendario("2026-08-16T00:00:00.000Z")).toBe("16/08/2026");
  });

  it("null/undefined → guion", () => {
    expect(fechaCalendario(null)).toBe("—");
    expect(fechaCalendario(undefined)).toBe("—");
  });

  it("texto no reconocible se devuelve tal cual", () => {
    expect(fechaCalendario("no-es-fecha")).toBe("no-es-fecha");
  });
});

describe("fechaCalendarioLarga", () => {
  it("formatea en español sin correrse de día en los bordes de mes", () => {
    expect(fechaCalendarioLarga("2026-08-31")).toBe("31 de agosto de 2026");
    expect(fechaCalendarioLarga("2026-01-01")).toBe("1 de enero de 2026");
  });

  it("null → guion", () => {
    expect(fechaCalendarioLarga(null)).toBe("—");
  });
});

describe("fechaHoraLima (columna timestamptz, convierte de zona)", () => {
  it("null → guion", () => {
    expect(fechaHoraLima(null)).toBe("—");
  });

  it("convierte un instante UTC a hora de Lima (UTC-5)", () => {
    // 2026-08-19T00:00:00Z = 2026-08-18 19:00 en Lima.
    const r = fechaHoraLima("2026-08-19T00:00:00.000Z");
    expect(r).toContain("18/08/26");
    expect(r).toMatch(/7:00\s*p\.?\s*m\.?/i);
  });
});

describe("fechaLima", () => {
  it("null → guion", () => {
    expect(fechaLima(null)).toBe("—");
  });

  it("un instante cercano a medianoche puede caer en el día anterior en Lima", () => {
    expect(fechaLima("2026-08-19T02:00:00.000Z")).toBe("18/8/2026");
  });
});

describe("fechaConHora", () => {
  it("muestra la hora de Lima cuando el registro la tiene", () => {
    expect(fechaConHora("2026-09-22T20:16:00Z")).toMatch(/22\/9\/2026 · 3:16/);
  });
  it("no inventa hora para un día pelado ni para la medianoche UTC del Excel", () => {
    expect(fechaConHora("2026-09-22")).toBe("22/09/2026");
    expect(fechaConHora("2026-08-22T00:00:00+00:00")).not.toContain("·");
  });
});
