import { describe, expect, it } from "vitest";
import { fechaLarga, modeloDeLaDescripcion, propuestaDeHoja } from "./protocolo-hoja";

// La descripción REAL del pedido de TRANSPORTES TOURS LIBERTADORES (Ariana, 07-10),
// el mismo cuyo protocolo de julio es el modelo.
const TORRE =
  "LAVADORA – SECADORA SEMI INDUSTRIAL OPL – APILABLE MARCA: LG MODELO: GIANT C MAX CAPACIDAD: 10 - 13 KG GAS GLP 220V/60Hz/1Ph SERIE: 405KWATM5344 SERIE: 303KWSB87694";

describe("propuestaDeHoja", () => {
  it("la lavadora de la torre: 13 KG y la primera serie", () => {
    expect(propuestaDeHoja({ descripcion: TORRE, serie: null, parte_nombre: null }, "principal")).toEqual({
      equipo: "LAVADORA 13 KG",
      modelo: "GIANT C MAX",
      serie: "405KWATM5344",
    });
  });
  it("la secadora de la torre: 10 KG y la segunda serie", () => {
    expect(propuestaDeHoja({ descripcion: TORRE, serie: null, parte_nombre: null }, "secadora")).toEqual({
      equipo: "SECADORA 10 KG",
      modelo: "GIANT C MAX",
      serie: "303KWSB87694",
    });
  });
  it("la serie registrada manda sobre la del texto", () => {
    expect(propuestaDeHoja({ descripcion: TORRE, serie: "405KWATM9999", parte_nombre: null }, "principal").serie).toBe("405KWATM9999");
  });
  it("una lavadora sola", () => {
    expect(
      propuestaDeHoja({ descripcion: "LAVADORA INDUSTRIAL MARCA: SPEED QUEEN MODELO: SC40 CAPACIDAD: 18 KG", serie: "X1", parte_nombre: null }, "principal"),
    ).toEqual({ equipo: "LAVADORA 18 KG", modelo: "SC40", serie: "X1" });
  });
  it("sin capacidad ni modelo", () => {
    expect(propuestaDeHoja({ descripcion: "Caldera pirotubular", serie: null, parte_nombre: null }, "principal")).toEqual({
      equipo: "CALDERA",
      modelo: undefined,
      serie: undefined,
    });
  });
});

describe("modeloDeLaDescripcion y fechaLarga", () => {
  it("corta el modelo en la siguiente etiqueta", () => {
    expect(modeloDeLaDescripcion("MODELO: WT7900HBA SERIE: 1")).toBe("WT7900HBA");
  });
  it("escribe la fecha como el Word", () => {
    expect(fechaLarga("2026-07-01")).toBe("Miércoles 01 julio del 2026");
    expect(fechaLarga("2026-03-04")).toBe("Miércoles 04 marzo del 2026");
  });
});
