import { describe, expect, it } from "vitest";
import { codigoYNombre } from "./nombre-de-ficha";

describe("el código y el nombre que propone el archivo de la ficha", () => {
  it("lee el código separado con punto, que es como se llaman las fichas de UNIMAC", () => {
    // La que reportó operaciones el 09-09: entraba sin código y llamándose
    // «SECU75E3. SECADORA UT075».
    expect(codigoYNombre("SECU75E3. SECADORA UT075-DUAL DIGITAL -GALVANIZADO-ELECTRICO-220V.docx")).toEqual({
      sku: "SECU75E3",
      nombre: "SECADORA UT075",
    });
  });

  it("lee el código separado con guion, que es como se llaman las de ALLIANCE", () => {
    expect(codigoYNombre("LAVF280-LAVADORA FX 280-CONTROL X-400G-220V.docx")).toEqual({
      sku: "LAVF280",
      nombre: "LAVADORA FX 280",
    });
  });

  it("no inventa un código cuando el archivo no lo trae", () => {
    expect(codigoYNombre("SECADORA UT075-DUAL DIGITAL-GALVANIZADO-ELECTRICO-220V.docx")).toEqual({
      sku: null,
      nombre: "SECADORA UT075",
    });
  });

  it("no toma por código una palabra sin dígitos", () => {
    expect(codigoYNombre("SECADORA-INDUSTRIAL A GAS.docx")).toEqual({ sku: null, nombre: "SECADORA" });
  });

  it("deja el código en mayúsculas y el nombre sin espacios de más", () => {
    expect(codigoYNombre("co402a.  COCHE  DE ROPA -AZUL.docx")).toEqual({ sku: "CO402A", nombre: "COCHE DE ROPA" });
  });
});
