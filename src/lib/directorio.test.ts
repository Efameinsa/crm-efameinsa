import { describe, expect, it } from "vitest";
import { correosDelArea } from "./directorio";
import { conDni, mismoTecnico } from "./tecnicos";

const filas = [
  { nombre: "Jhon Calsin", correo_efameinsa: "contabilidad1@efameinsa.com", correo_open: "gestion1@openinvestments.com.pe", avisos: ["finanzas"] },
  { nombre: "Jeysson Alania", correo_efameinsa: "almacen@efameinsa.com", correo_open: "almacen@openinvestments.com.pe", avisos: ["almacen"] },
  { nombre: "Lesly Meneses", correo_efameinsa: "logistica2@efameinsa.com", correo_open: null, avisos: ["almacen"] },
  { nombre: "Ya no está", correo_efameinsa: "x@efameinsa.com", correo_open: null, avisos: ["almacen"], activo: false },
];

describe("correosDelArea (0410)", () => {
  it("el pedido OPEN va a los correos OPEN; el EFAMEINSA, a los de EFAMEINSA", () => {
    expect(correosDelArea(filas, ["finanzas"], "OPEN")).toEqual(["gestion1@openinvestments.com.pe"]);
    expect(correosDelArea(filas, ["finanzas"], "EFAMEINSA")).toEqual(["contabilidad1@efameinsa.com"]);
  });
  it("si le falta el de esa empresa, le llega al otro; y el que ya no está no recibe", () => {
    expect(correosDelArea(filas, ["almacen"], "OPEN")).toEqual(["almacen@openinvestments.com.pe", "logistica2@efameinsa.com"]);
  });
  it("sin repetir aunque esté en dos áreas", () => {
    const dos = [{ ...filas[0], avisos: ["finanzas", "almacen"] }];
    expect(correosDelArea(dos, ["finanzas", "almacen"], "EFAMEINSA")).toEqual(["contabilidad1@efameinsa.com"]);
  });
});

const relacion = [
  { nombre: "Cristhian Dolorier", dni: "72755590" },
  { nombre: "Danny Solis", dni: "40115086" },
  { nombre: "Nilton Monago", dni: "10259066" },
];

describe("el técnico con su DNI (0410)", () => {
  it("reconoce el nombre aunque falte la hache o las mayúsculas", () => {
    expect(mismoTecnico("Cristhian Dolorier", "cristian dolorier")).toBe(true);
    expect(mismoTecnico("Cristhian Dolorier", "C. Dolorier")).toBe(true);
    expect(mismoTecnico("Danny Solis", "Danny Solís")).toBe(true);
    expect(mismoTecnico("Danny Solis", "Marco Solis")).toBe(false);
  });
  it("pone el DNI a cada uno, y al tercero lo deja como está", () => {
    expect(conDni("Cristian Dolorier", relacion)).toBe("CRISTHIAN DOLORIER — DNI 72755590");
    expect(conDni("DANNY SOLIS / Nilton Monago", relacion)).toBe("DANNY SOLIS — DNI 40115086\nNILTON MONAGO — DNI 10259066");
    expect(conDni("Juan Pérez (tercero)", relacion)).toBe("Juan Pérez (tercero)");
    expect(conDni("  ", relacion)).toBeNull();
  });
});
