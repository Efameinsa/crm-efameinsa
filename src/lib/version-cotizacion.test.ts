import { describe, expect, it } from "vitest";
import { codigoConVersion, etiquetaVersion, notaDeVersion } from "./version-cotizacion";

// Gerencia, 23-09: «dejar claro cuál es la cotización final».
describe("versión de una cotización corregida", () => {
  it("la original no lleva nada", () => {
    expect(etiquetaVersion(1)).toBeNull();
    expect(etiquetaVersion(null)).toBeNull();
    expect(codigoConVersion("Presu_569-26", 1)).toBe("Presu_569-26");
    expect(notaDeVersion({ version: 1 })).toBeNull();
  });

  it("desde la primera corrección, el número lleva su versión", () => {
    expect(codigoConVersion("Presu_569-26", 2)).toBe("Presu_569-26 v2");
    expect(codigoConVersion(null, 2)).toBeNull();
    expect(notaDeVersion({ version: 2, corregidaAt: "2026-09-07T19:40:46Z" })).toBe(
      "Versión 2 · corregida el 07/09/2026 · reemplaza a la versión anterior",
    );
  });

  it("una archivada dice que fue reemplazada y por cuál", () => {
    expect(notaDeVersion({ version: 1, reemplazadaPor: 2 })).toBe("Versión 1 · REEMPLAZADA por la versión 2");
  });
});
