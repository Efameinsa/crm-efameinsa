import { describe, expect, it } from "vitest";
import { tokensRaros } from "./fichas-relacionadas";

describe("tokensRaros", () => {
  // El caso real del 22-09: tres fichas de INVERSIONES HUAMAN RUIZ, escritas
  // distinto, sin RUC. «HUAMAN» solo es un apellido común (241 cuentas de
  // 16.226); «HUAMAN RUIZ» juntas, tal como están en el texto, las tienen
  // solo dos — es eso lo que las cruza, no la palabra suelta.
  it("junta palabras seguidas en vez de usarlas sueltas", () => {
    expect(tokensRaros("INVERSIONES HUAMAN RUIZ S.R.L")).toEqual(["HUAMAN RUIZ"]);
    expect(tokensRaros("INVERSIONES HUAMAN RUIZ S.R.L - HOSPEDAJE MIGUEL ANGEL")).toContain("HUAMAN RUIZ");
  });

  it("descarta las siglas societarias y las palabras genéricas del rubro", () => {
    expect(tokensRaros("HOTEL RESORT INVERSIONES PERU S.A.C.")).toEqual([]);
  });

  it("cae a una palabra sola cuando no hay ningún par distintivo", () => {
    // Un solo nombre y apellido distintivos, sin nada más al lado.
    expect(tokensRaros("PANGALIMA")).toEqual(["PANGALIMA"]);
  });

  it("junta nombre y apellido de una persona, no solo de una empresa", () => {
    expect(tokensRaros("RUIZ PANGALIMA")).toEqual(["RUIZ PANGALIMA"]);
  });

  it("ignora tildes y mayúsculas al comparar", () => {
    expect(tokensRaros("inversiones huamán ruiz")).toEqual(["HUAMAN RUIZ"]);
  });
});
