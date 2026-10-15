import { describe, expect, it } from "vitest";
import { docVisita, errorDocVisita, guardarDocVisita } from "./visitas-planta-columnas";

describe("DNI o C.E. de la visita (Rubí, buzón 15-10)", () => {
  it("guarda el C.E. con «CE» adelante y el DNI solo con dígitos", () => {
    expect(guardarDocVisita(" 4512 3678 ", "dni")).toBe("45123678");
    expect(guardarDocVisita("001-234-567", "ce")).toBe("CE001234567");
    expect(guardarDocVisita("  ", "ce")).toBe("");
  });
  it("muestra «DNI …» o «C.E. …»", () => {
    expect(docVisita("45123678")).toBe("DNI 45123678");
    expect(docVisita("CE001234567")).toBe("C.E. 001234567");
    expect(docVisita(null)).toBe("");
  });
  it("el DNI pide 8 dígitos; vacío no es error", () => {
    expect(errorDocVisita("4512367", "dni")).toMatch(/8 dígitos/);
    expect(errorDocVisita("45123678", "dni")).toBeNull();
    expect(errorDocVisita("001234567", "ce")).toBeNull();
    expect(errorDocVisita("", "dni")).toBeNull();
  });
});
