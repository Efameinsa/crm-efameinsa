import { describe, expect, it } from "vitest";
import { promedioSemanal } from "@/lib/pulso-semana";

/**
 * La referencia de cotizaciones es lo único que el pulso calcula solo (las
 * otras dos las fija gerencia). Si esto se rompe, el comercial ve una barra
 * llena o vacía sin haber cambiado nada de su trabajo.
 */
describe("promedioSemanal", () => {
  it("sin historial no inventa una referencia", () => {
    expect(promedioSemanal(undefined)).toBeNull();
    expect(promedioSemanal(new Map())).toBeNull();
  });

  it("promedia solo las semanas que tuvieron actividad", () => {
    // Tres semanas trabajadas: 20, 10 y 15. Las que no aparecen (vacaciones,
    // o antes de entrar a la empresa) no le bajan la vara.
    const r = promedioSemanal(new Map([["2026-08-03", 20], ["2026-08-10", 10], ["2026-08-17", 15]]));
    expect(r).toBe(15);
  });

  it("respeta el piso: una semana floja no deja la vara en el suelo", () => {
    expect(promedioSemanal(new Map([["2026-08-17", 1]]))).toBe(5);
  });

  it("redondea, no deja decimales sueltos en pantalla", () => {
    expect(promedioSemanal(new Map([["2026-08-10", 10], ["2026-08-17", 15]]))).toBe(13);
  });
});
