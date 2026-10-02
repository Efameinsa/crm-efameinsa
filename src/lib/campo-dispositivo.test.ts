import { describe, expect, it } from "vitest";
import { nombreDelCelular, validarVinculacion } from "./campo-dispositivo";
import { TEXTO_CONSENTIMIENTO, VERSION_CONSENTIMIENTO } from "./campo-consentimiento";

const bueno = {
  instalacion_id: "b3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  modelo: "Samsung A15",
  version_app: "1.0.0",
  consentimiento: { version: VERSION_CONSENTIMIENTO, aceptado: true },
};

describe("vinculación de la app de Android", () => {
  it("acepta una vinculación completa", () => {
    const r = validarVinculacion(bueno);
    expect(r.ok).toBe(true);
  });

  it("sin aceptar el registro NO se vincula: pide el consentimiento (409)", () => {
    for (const cuerpo of [
      { ...bueno, consentimiento: { version: VERSION_CONSENTIMIENTO, aceptado: false } },
      { ...bueno, consentimiento: { version: VERSION_CONSENTIMIENTO } },
      { ...bueno, consentimiento: "si" },
    ]) {
      const r = validarVinculacion(cuerpo);
      expect(r).toMatchObject({ ok: false, estado: 409, error: "consentimiento" });
    }
  });

  it("sin consentimiento en el cuerpo pasa la validación: el CRM comprueba si ya había aceptado la versión vigente", () => {
    const { consentimiento: _c, ...sin } = bueno;
    expect(validarVinculacion(sin).ok).toBe(true);
  });

  it("si el texto cambió, la aceptación vieja no vale (vuelve a pedirla)", () => {
    const r = validarVinculacion({ ...bueno, consentimiento: { version: "2025-01-01", aceptado: true } });
    expect(r).toMatchObject({ ok: false, estado: 409, error: "consentimiento" });
  });

  it("rechaza una instalación inventada o un cuerpo que no es JSON", () => {
    expect(validarVinculacion({ ...bueno, instalacion_id: "a b" })).toMatchObject({ ok: false, estado: 400, error: "datos" });
    expect(validarVinculacion({ ...bueno, instalacion_id: "x" })).toMatchObject({ ok: false, estado: 400 });
    expect(validarVinculacion(null)).toMatchObject({ ok: false });
  });

  it("el nombre del celular dice de quién es", () => {
    expect(nombreDelCelular("Brenda Taboada", "Samsung A15")).toBe("App de Brenda Taboada · Samsung A15");
    expect(nombreDelCelular(null)).toBe("App de campo");
  });
});

describe("texto de consentimiento", () => {
  it("dice las cosas que la ley pide: qué, cuándo, para qué y quién lo ve", () => {
    const todo = TEXTO_CONSENTIMIENTO.puntos.join(" ");
    expect(todo).toMatch(/Qué se registra/);
    expect(todo).toMatch(/24 horas/);
    expect(todo).toMatch(/Para qué/);
    expect(todo).toMatch(/Quién lo ve/);
    expect(TEXTO_CONSENTIMIENTO.pie).toMatch(/29733/);
  });
});
