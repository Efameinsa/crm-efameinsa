import { describe, expect, it } from "vitest";
import { appDesactualizada, compararVersiones, VERSION_MINIMA_APP, VERSION_ULTIMA_APP } from "./app-version";

describe("versiones de la app de Android", () => {
  it("compara número por número, no como texto", () => {
    expect(compararVersiones("1.2.10", "1.2.9")).toBeGreaterThan(0);
    expect(compararVersiones("1.0.0", "1.0")).toBe(0);
    expect(compararVersiones("0.9.9", "1.0.0")).toBeLessThan(0);
    expect(compararVersiones("2.0", "1.99.99")).toBeGreaterThan(0);
  });

  it("la mínima nunca supera a la última", () => {
    expect(compararVersiones(VERSION_MINIMA_APP, VERSION_ULTIMA_APP)).toBeLessThanOrEqual(0);
  });

  it("solo avisa si la versión instalada es menor que la mínima", () => {
    expect(appDesactualizada(VERSION_MINIMA_APP)).toBe(false);
    expect(appDesactualizada(VERSION_ULTIMA_APP)).toBe(false);
    expect(appDesactualizada("0.0.1")).toBe(true);
    // Fuera de la app (sin versión) no hay nada que actualizar.
    expect(appDesactualizada(null)).toBe(false);
    expect(appDesactualizada(undefined)).toBe(false);
  });
});
