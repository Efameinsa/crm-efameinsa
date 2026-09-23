import { describe, expect, it } from "vitest";
import { SERIE_POR_DEFECTO, motivoParaGuardar, problemaSerie } from "./serie-facturacion";

// Open primero (gerencia, 23-09-2026): Efameinsa se permite, con motivo.
describe("serie de facturación", () => {
  it("arranca en OPEN", () => {
    expect(SERIE_POR_DEFECTO).toBe("OPEN");
  });

  it("OPEN no pide motivo", () => {
    expect(problemaSerie("OPEN", null)).toBeNull();
  });

  it("EFAMEINSA pide una frase de motivo", () => {
    expect(problemaSerie("EFAMEINSA", null)).toMatch(/motivo/);
    expect(problemaSerie("EFAMEINSA", "   cliente  ")).toMatch(/motivo/);
    expect(problemaSerie("EFAMEINSA", "El cliente insistió tras explicarle")).toBeNull();
  });

  it("en OPEN el motivo no se guarda", () => {
    expect(motivoParaGuardar("OPEN", "algo escrito antes")).toBeNull();
    expect(motivoParaGuardar("EFAMEINSA", "  insistió  ")).toBe("insistió");
    expect(motivoParaGuardar("EFAMEINSA", "   ")).toBeNull();
  });
});
