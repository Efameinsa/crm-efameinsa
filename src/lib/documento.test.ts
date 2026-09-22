import { describe, expect, it } from "vitest";
import { dniValido, errorDocumento, rucDentroDelTexto, rucValido } from "./documento";

// Los RUC de estas pruebas salen de la propia base: 9.891 de los 9.904 pasan
// el módulo 11, y los 13 que no son datos malos del histórico (prefijos que
// SUNAT no usa, como 11 y 24, o un dígito cambiado).

describe("rucValido", () => {
  it("acepta RUCs reales de la cartera", () => {
    expect(rucValido("20552956461")).toBe(true); // LOGISMINSA
    expect(rucValido("20539402774")).toBe(true);
  });

  it("rechaza un dígito cambiado", () => {
    expect(rucValido("20552956462")).toBe(false);
  });

  it("rechaza prefijos que SUNAT no usa", () => {
    expect(rucValido("11404261196")).toBe(false);
    expect(rucValido("24045187286")).toBe(false);
  });

  it("rechaza largos distintos de 11", () => {
    expect(rucValido("2055295646")).toBe(false);
    expect(rucValido("205529564611")).toBe(false);
  });

  it("ignora guiones y espacios", () => {
    expect(rucValido("20-552956461")).toBe(true);
  });
});

describe("rucDentroDelTexto", () => {
  // El caso real del 22-09: Brenda escribió el RUC dentro del nombre del
  // contacto y la ficha nació sin documento (Inversiones Huamán Ruiz).
  it("encuentra el RUC de Huamán Ruiz escrito dentro del nombre", () => {
    const r = rucDentroDelTexto("20600852893 - INVERSIONES HUAMAN RUIZ S.R.L");
    expect(r?.ruc).toBe("20600852893");
    expect(r?.resto).toBe("INVERSIONES HUAMAN RUIZ S.R.L");
  });

  it("funciona con el RUC al final o en medio del texto", () => {
    expect(rucDentroDelTexto("INVERSIONES HUAMAN RUIZ S.R.L 20600852893")?.resto).toBe("INVERSIONES HUAMAN RUIZ S.R.L");
    expect(rucDentroDelTexto("TITAN CONTRATISTAS 20447844835 GENERALES SAC")?.resto).toBe("TITAN CONTRATISTAS GENERALES SAC");
  });

  it("no dispara con un DNI, un celular o cualquier corrida de 11 dígitos", () => {
    expect(rucDentroDelTexto("DNI 45187286")).toBeNull();
    expect(rucDentroDelTexto("celular 987654321")).toBeNull();
    expect(rucDentroDelTexto("código 20600852892")).toBeNull(); // dígito verificador malo
  });

  it("no dispara cuando no hay ningún número largo", () => {
    expect(rucDentroDelTexto("RIVERA CIERTO BERTHA FABIOLA")).toBeNull();
  });
});

describe("dniValido", () => {
  it("acepta 8 dígitos", () => {
    expect(dniValido("45187286")).toBe(true);
  });
  it("rechaza otros largos", () => {
    expect(dniValido("4518728")).toBe(false);
    expect(dniValido("451872860")).toBe(false);
  });
});

describe("errorDocumento", () => {
  it("no exige nada cuando es SIN_DOC", () => {
    expect(errorDocumento("SIN_DOC", "")).toBeNull();
  });

  it("pide el número cuando el tipo lo necesita", () => {
    expect(errorDocumento("RUC", "  ")).toMatch(/Escriba el número/);
  });

  it("dice cuántos dígitos faltan", () => {
    expect(errorDocumento("RUC", "2055295")).toMatch(/11 dígitos; escribió 7/);
    expect(errorDocumento("DNI", "451")).toMatch(/8 dígitos; escribió 3/);
  });

  it("distingue un largo correcto con dígito verificador malo", () => {
    expect(errorDocumento("RUC", "20552956462")).toMatch(/no existe/);
  });

  it("acepta un documento correcto", () => {
    expect(errorDocumento("RUC", "20552956461")).toBeNull();
    expect(errorDocumento("DNI", "45187286")).toBeNull();
    expect(errorDocumento("CE", "001234567")).toBeNull();
  });
});
