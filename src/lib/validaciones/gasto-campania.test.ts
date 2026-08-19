import { describe, expect, it } from "vitest";
import { esquemaGastoCampania, esquemaRegistroGasto } from "./gasto-campania";

const REGISTRO_BASE = {
  campaign_id: "123456",
  nombre: "Campaña verano",
  fecha: "2026-08-19",
  impresiones: 1000,
  clics: 20,
  leads_reportados: 3,
};

describe("esquemaRegistroGasto", () => {
  it("acepta el caso normal con gasto directo", () => {
    const r = esquemaRegistroGasto.safeParse({ ...REGISTRO_BASE, gasto: 150.5 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gasto).toBe(150.5);
  });

  it("calcula gasto desde gasto_micros cuando no viene gasto directo (Google Ads)", () => {
    const r = esquemaRegistroGasto.safeParse({ ...REGISTRO_BASE, gasto_micros: 150_500_000 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gasto).toBe(150.5);
  });

  it("sin gasto ni gasto_micros → 0 (Google omite el campo cuando el valor es 0)", () => {
    const r = esquemaRegistroGasto.safeParse(REGISTRO_BASE);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gasto).toBe(0);
  });

  it("numéricos como string (formato de Make) se convierten", () => {
    const r = esquemaRegistroGasto.safeParse({
      ...REGISTRO_BASE,
      campaign_id: 123456,
      gasto: "150.50",
      impresiones: "1000",
      clics: "20",
      leads_reportados: "3",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.campaign_id).toBe("123456");
      expect(r.data.gasto).toBe(150.5);
      expect(r.data.impresiones).toBe(1000);
    }
  });

  it("string vacío en un numérico se trata como 0, no como error", () => {
    const r = esquemaRegistroGasto.safeParse({ ...REGISTRO_BASE, gasto: "", clics: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.gasto).toBe(0);
      expect(r.data.clics).toBe(0);
    }
  });

  it("string numérico inválido se trata como 0, no rompe el request de Make", () => {
    const r = esquemaRegistroGasto.safeParse({ ...REGISTRO_BASE, impresiones: "no-es-numero" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.impresiones).toBe(0);
  });

  it("leads_reportados fraccionado (atribución parcial de Google) se redondea", () => {
    const r = esquemaRegistroGasto.safeParse({ ...REGISTRO_BASE, leads_reportados: 2.6 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.leads_reportados).toBe(3);
  });

  it("moneda por defecto es USD; PEN también es válida", () => {
    const r1 = esquemaRegistroGasto.safeParse(REGISTRO_BASE);
    expect(r1.success && r1.data.moneda).toBe("USD");
    const r2 = esquemaRegistroGasto.safeParse({ ...REGISTRO_BASE, moneda: "PEN" });
    expect(r2.success && r2.data.moneda).toBe("PEN");
  });

  it("campaign_id vacío falla", () => {
    const r = esquemaRegistroGasto.safeParse({ ...REGISTRO_BASE, campaign_id: "" });
    expect(r.success).toBe(false);
  });

  it("fecha con formato inválido falla", () => {
    const r = esquemaRegistroGasto.safeParse({ ...REGISTRO_BASE, fecha: "19/08/2026" });
    expect(r.success).toBe(false);
  });

  it("negativos no son válidos", () => {
    const r = esquemaRegistroGasto.safeParse({ ...REGISTRO_BASE, gasto: -5 });
    expect(r.success).toBe(false);
  });
});

describe("esquemaGastoCampania", () => {
  it("requiere al menos un registro", () => {
    const r = esquemaGastoCampania.safeParse({ plataforma: "google", registros: [] });
    expect(r.success).toBe(false);
  });

  it("acepta un lote válido de registros", () => {
    const r = esquemaGastoCampania.safeParse({
      plataforma: "meta",
      registros: [REGISTRO_BASE, { ...REGISTRO_BASE, campaign_id: "999" }],
    });
    expect(r.success).toBe(true);
  });

  it("plataforma fuera de google/meta falla", () => {
    const r = esquemaGastoCampania.safeParse({ plataforma: "tiktok", registros: [REGISTRO_BASE] });
    expect(r.success).toBe(false);
  });
});
