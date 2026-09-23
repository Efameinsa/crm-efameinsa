import { describe, expect, it } from "vitest";
import { coincideBusquedaWa, digitosDeBusqueda } from "./contacto-whatsapp";

const conv = { telefono: "51987654321", usuario_wa: null, nombre_wa: "José Pérez" };

describe("digitosDeBusqueda", () => {
  it("saca los dígitos de un número escrito con espacios o prefijo", () => {
    expect(digitosDeBusqueda("+51 987 654 321")).toBe("51987654321");
    expect(digitosDeBusqueda("987-654")).toBe("987654");
  });
  it("un nombre no es búsqueda por número", () => {
    expect(digitosDeBusqueda("jose")).toBeNull();
    expect(digitosDeBusqueda("   ")).toBeNull();
  });
});

describe("coincideBusquedaWa", () => {
  it("encuentra por número completo, con prefijo o por los últimos dígitos", () => {
    expect(coincideBusquedaWa(conv, "987654321")).toBe(true);
    expect(coincideBusquedaWa(conv, "+51 987 654 321")).toBe(true);
    expect(coincideBusquedaWa(conv, "4321")).toBe(true);
    expect(coincideBusquedaWa(conv, "999")).toBe(false);
  });
  it("encuentra por nombre sin importar tildes ni mayúsculas", () => {
    expect(coincideBusquedaWa(conv, "jose PEREZ")).toBe(true);
    expect(coincideBusquedaWa(conv, "maría")).toBe(false);
  });
  it("encuentra por @usuario al que oculta su número, pero no por su identificador", () => {
    const oculto = { telefono: "PE.1656123", usuario_wa: "lavanderia_sol", nombre_wa: null };
    expect(coincideBusquedaWa(oculto, "@lavanderia")).toBe(true);
    expect(coincideBusquedaWa(oculto, "1656")).toBe(false);
  });
  it("sin texto, todo coincide", () => {
    expect(coincideBusquedaWa(conv, "")).toBe(true);
  });
});
