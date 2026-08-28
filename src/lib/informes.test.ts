import { describe, it, expect } from "vitest";
import { avisosDeIdentidad } from "./informes";

// El control que pidió el ing. Carlos el 27-08: «que la razón social del cierre
// sea la que se vendió, a veces son muy similares pero tienen otro rumbo».
const FICHA = { razonSocial: "INVERSIONES NACIONALES DE TURISMO S.A.", numDoc: "20114803228" };

describe("a quién se le factura", () => {
  it("no dice nada cuando el cierre calza con la ficha", () => {
    expect(avisosDeIdentidad({ nombre: FICHA.razonSocial, doc: FICHA.numDoc }, FICHA)).toEqual([]);
  });

  it("perdona espacios de más y mayúsculas: no son un cliente distinto", () => {
    expect(
      avisosDeIdentidad({ nombre: "  Inversiones   Nacionales de Turismo S.A. ", doc: " 20114803228 " }, FICHA),
    ).toEqual([]);
  });

  it("canta el RUC que no es el de la ficha", () => {
    const avisos = avisosDeIdentidad({ nombre: FICHA.razonSocial, doc: "20604375038" }, FICHA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("20604375038");
    expect(avisos[0]).toContain("20114803228");
  });

  // El caso real de las tres fichas de INTURSA: la matriz, "HOTEL PARACAS" y
  // "LIBERTADOR HOTELS". Se parecen tanto que a ojo pasan.
  it("canta la razón social parecida pero distinta", () => {
    const avisos = avisosDeIdentidad(
      { nombre: "INVERSIONES NACIONALES DE TURISMO S.A. - HOTEL PARACAS", doc: FICHA.numDoc },
      FICHA,
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("razón social");
  });

  it("sin RUC avisa que Central no puede facturar", () => {
    const avisos = avisosDeIdentidad({ nombre: FICHA.razonSocial, doc: "   " }, FICHA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("no puede emitir la factura");
  });

  it("si la ficha no tiene documento, dice que no hay contra qué contrastar", () => {
    const avisos = avisosDeIdentidad({ nombre: "OTRO NOMBRE S.A.C.", doc: "20114803228" }, {
      razonSocial: "OTRO NOMBRE S.A.C.",
      numDoc: null,
    });
    expect(avisos).toEqual(["La ficha del cliente no tiene documento cargado, así que no hay contra qué contrastarlo."]);
  });

  it("acumula los dos avisos cuando nada calza", () => {
    expect(avisosDeIdentidad({ nombre: "OTRA EMPRESA S.A.C.", doc: "20604375038" }, FICHA)).toHaveLength(2);
  });
});
