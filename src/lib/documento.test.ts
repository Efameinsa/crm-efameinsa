import { describe, expect, it } from "vitest";
import { dniValido, errorDocumento, rucValido } from "./documento";

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
