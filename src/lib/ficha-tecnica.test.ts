import { describe, expect, it } from "vitest";
import { clasificarFicha, contenidoDeFicha, esSubtituloDeFicha } from "./ficha-tecnica";

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

describe("contenidoDeFicha", () => {
  /* El 28-08, con los coches ya cargados y las comerciales cotizándolos, la
     pantalla los mostraba vacíos y con el cartel «Sin ficha técnica cargada»:
     miraba solo los cuatro cajones viejos y la ficha del Word vive en
     `bloques`. Esta prueba es para que no vuelva a pasar. */
  const fichaDeCoche = {
    bloques: [
      { t: "titulo", texto: "CARACTERÍSTICAS" },
      { t: "vineta", texto: "Especial para carga de ropa de lavandería." },
      { t: "vineta", texto: "Fabricadas con polietileno virgen (PE), durable y liviano." },
      { t: "titulo", texto: "MEDIDAS GENERALES" },
      { t: "dato", texto: "Largo : 47 1/4” (1200 mm)" },
      { t: "dato", texto: "Peso Neto : 31 kg" },
    ],
    origen_descripcion: "ficha word de Lesly",
  };

  it("lee la descripción que dejó el Word, aunque no haya cajones viejos", () => {
    const r = contenidoDeFicha(fichaDeCoche);
    expect(r.sinFicha).toBe(false);
    expect(r.caracteristicas).toEqual([
      "CARACTERÍSTICAS",
      "Especial para carga de ropa de lavandería.",
      "Fabricadas con polietileno virgen (PE), durable y liviano.",
      "MEDIDAS GENERALES",
    ]);
    expect(r.nDimensiones).toBe(2);
  });

  it("los bloques mandan sobre los cajones viejos", () => {
    const r = contenidoDeFicha({ ...fichaDeCoche, caracteristicas: ["Texto viejo que ya no corresponde"] });
    expect(r.caracteristicas).not.toContain("Texto viejo que ya no corresponde");
  });

  it("sigue leyendo las fichas guardadas en los cuatro cajones", () => {
    const r = contenidoDeFicha({
      caracteristicas: ["Sistema de suspensión rígido"],
      disenoConstruccion: ["TAMBOR", "Acero inoxidable"],
      dimensiones: ["Altura : 1,267 mm"],
    });
    expect(r.caracteristicas).toEqual(["Sistema de suspensión rígido", "TAMBOR", "Acero inoxidable"]);
    expect(r.nDimensiones).toBe(1);
    expect(r.sinFicha).toBe(false);
  });

  it("un equipo sin nada cargado sí es «sin ficha»", () => {
    for (const ficha of [null, undefined, {}, { bloques: [] }, { bloques: "no es una lista" }]) {
      expect(contenidoDeFicha(ficha as Record<string, unknown>).sinFicha, JSON.stringify(ficha)).toBe(true);
    }
  });
});
