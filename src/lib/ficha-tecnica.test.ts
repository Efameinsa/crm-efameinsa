import { describe, expect, it } from "vitest";
import { clasificarFicha, esSubtituloDeFicha } from "./ficha-tecnica";

describe("esSubtituloDeFicha", () => {
  it("reconoce los títulos de las fichas de secadora", () => {
    for (const t of [
      "TAMBOR",
      "PUERTA",
      "PANELES",
      "PANEL FRONTAL",
      "SISTEMA DE TRASMISION",
      "SISTEMA DE TRANSMISION",
      "CALEFACCION DE SECADO",
      "SISTEMA OPTIDRY",
    ]) {
      expect(esSubtituloDeFicha(t), t).toBe(true);
    }
  });

  it("reconoce los títulos de las fichas de lavadora, que no se parecen entre sí", () => {
    for (const t of ["SOAP BOARD – 8 SIGNALS", "OPTISPRAY (SPRAY RINSE)", "TECNOLOGIA DESTACADAS", "CASCADE DRUM"]) {
      expect(esSubtituloDeFicha(t), t).toBe(true);
    }
  });

  it("no confunde una viñeta con un título", () => {
    for (const v of [
      "Fabricado en acero galvanizado",
      "Con agujeros embutidos con micro pulido para evitar maltratar las prendas",
      "Calentamiento a Gas GLP; 175,000.00 btu/hr",
      "Descarga de aire comprimido 8’’",
      "Panel superior e inferior en acero estructural con pintura resistente a la temperatura",
    ]) {
      expect(esSubtituloDeFicha(v), v).toBe(false);
    }
  });

  it("una frase larga en mayúsculas es viñeta, no título", () => {
    expect(
      esSubtituloDeFicha("TAMBOR Y CUBA INTERIOR FABRICADOS EN ACERO INOXIDABLE AISI 304 CON ACABADO SANITARIO"),
    ).toBe(false);
  });

  it("descarta lo que no tiene letras suficientes", () => {
    for (const v of ["", "  ", "8’’", "304", "•"]) expect(esSubtituloDeFicha(v), v).toBe(false);
  });

  it("un título con punto final ya es una frase", () => {
    expect(esSubtituloDeFicha("TAMBOR.")).toBe(false);
  });

  it("clasifica la ficha entera conservando el orden", () => {
    const r = clasificarFicha(["TAMBOR", "Fabricado en acero galvanizado", "PUERTA", "Bisagras extra pesadas"]);
    expect(r.map((x) => x.esSubtitulo)).toEqual([true, false, true, false]);
    expect(r[1].texto).toBe("Fabricado en acero galvanizado");
  });
});
