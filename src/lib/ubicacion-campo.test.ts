import { describe, expect, test } from "vitest";
import { distanciaM, duracion, precisionDudosa, textoPrecision, tramosSinSenal, urlGoogleMaps } from "@/lib/ubicacion-campo";

const a = (hhmm: string) => ({ created_at: `2026-10-02T${hhmm}:00-05:00` });

describe("tramosSinSenal (piloto de campo, Carlos 01-10)", () => {
  test("lecturas cada 10 min: sin huecos", () => {
    expect(tramosSinSenal([a("09:00"), a("09:10"), a("09:20"), a("09:31")])).toEqual([]);
  });

  test("CRM cerrado de 11:00 a 14:05 se marca", () => {
    const t = tramosSinSenal([a("10:50"), a("11:00"), a("14:05"), a("14:15")]);
    expect(t).toHaveLength(1);
    expect(t[0].minutos).toBe(185);
    expect(new Date(t[0].desde).getTime()).toBe(new Date("2026-10-02T11:00:00-05:00").getTime());
  });

  test("hoy, sin lecturas desde hace rato: tramo abierto", () => {
    const ahora = new Date("2026-10-02T16:00:00-05:00").getTime();
    const t = tramosSinSenal([a("15:00")], { esHoy: true, ahora });
    expect(t).toEqual([{ desde: new Date("2026-10-02T15:00:00-05:00").toISOString(), hasta: null, minutos: 60 }]);
  });

  test("un día pasado no deja tramo abierto al final", () => {
    expect(tramosSinSenal([a("15:00")], { esHoy: false, ahora: Date.now() })).toEqual([]);
  });

  test("el orden de llegada no importa", () => {
    expect(tramosSinSenal([a("14:05"), a("11:00")])).toHaveLength(1);
  });
});

describe("textos", () => {
  test("precisión", () => {
    expect(textoPrecision(8.4)).toBe("±8 m");
    expect(textoPrecision(null)).toBe("sin precisión");
    expect(textoPrecision(1500)).toMatch(/^±1[.,]5 km$/);
    expect(precisionDudosa(100)).toBe(false);
    expect(precisionDudosa(101)).toBe(true);
    expect(precisionDudosa(null)).toBe(true);
  });

  test("duración", () => {
    expect(duracion(45)).toBe("45 min");
    expect(duracion(120)).toBe("2 h");
    expect(duracion(135)).toBe("2 h 15 min");
  });

  test("enlace y distancia", () => {
    expect(urlGoogleMaps(-12.0464, -77.0428)).toBe("https://www.google.com/maps?q=-12.046400,-77.042800");
    const d = distanciaM({ lat: -12.0464, lon: -77.0428 }, { lat: -12.0473, lon: -77.0428 });
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(105);
  });
});
