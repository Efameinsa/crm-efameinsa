import { describe, expect, it } from "vitest";
import { seRastrea } from "./campo-rastreo";

describe("¿se rastrea a esta persona en la app?", () => {
  it("una cuenta real se rastrea sin marcarla (regla de gerencia: 24/7, celular de la empresa)", () => {
    expect(seRastrea({})).toBe(true);
    expect(seRastrea({ trabajo_de_campo: false, es_prueba: false })).toBe(true);
    expect(seRastrea({ trabajo_de_campo: null, es_prueba: null, rastreo_excluido: null })).toBe(true);
  });

  it("las cuentas de práctica y de demostración no son personas con celular: no se rastrean", () => {
    expect(seRastrea({ es_prueba: true })).toBe(false);
  });

  it("…salvo que se marquen a mano (así se prueba)", () => {
    expect(seRastrea({ es_prueba: true, trabajo_de_campo: true })).toBe(true);
  });

  it("gerencia y administración no se rastrean por defecto (hasta que Santos decida), salvo marcadas a mano", () => {
    expect(seRastrea({ rol: "gerencia" })).toBe(false);
    expect(seRastrea({ rol: "admin" })).toBe(false);
    expect(seRastrea({ rol: "gerencia", trabajo_de_campo: true })).toBe(true);
    expect(seRastrea({ rol: "comercial" })).toBe(true);
    expect(seRastrea({ rol: "central" })).toBe(true);
    expect(seRastrea({ rol: "postventa" })).toBe(true);
  });

  it("la exclusión de gerencia gana sobre todo lo demás", () => {
    expect(seRastrea({ rastreo_excluido: true })).toBe(false);
    expect(seRastrea({ rastreo_excluido: true, trabajo_de_campo: true })).toBe(false);
    expect(seRastrea({ rastreo_excluido: true, es_prueba: false })).toBe(false);
  });
});
