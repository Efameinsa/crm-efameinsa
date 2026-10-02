import { describe, expect, it } from "vitest";
import { analizarRecorrido, haceMinutos, type PuntoAnalizable } from "./recorrido-campo";

const MIN = 60_000;
const T0 = Date.parse("2026-10-02T14:00:00Z");
/** ~1 m de latitud ≈ 0,000009°. */
const M = 0.000009;
const p = (min: number, dxM: number, dyM = 0, precision: number | null = 8): PuntoAnalizable => ({
  lat: -12.0464 + dyM * M,
  lon: -77.0428 + dxM * M,
  precision,
  t: T0 + min * MIN,
});

describe("analizarRecorrido", () => {
  it("un celular quieto con el GPS temblando es UNA parada, no una nube de puntos", () => {
    const quieto = Array.from({ length: 12 }, (_, i) => p(i, (i % 3) * 4, (i % 2) * 5)); // 12 min, ±5 m de temblor
    const a = analizarRecorrido(quieto);
    expect(a.paradas).toHaveLength(1);
    expect(a.paradas[0].minutos).toBe(11);
    expect(a.paradas[0].puntos).toBe(12);
    expect(a.nodos).toHaveLength(1);
    expect(a.km).toBe(0);
  });

  it("caminar no genera paradas y suma kilómetros sobre la línea", () => {
    const camina = Array.from({ length: 10 }, (_, i) => p(i, i * 120)); // 120 m por minuto, 1,08 km
    const a = analizarRecorrido(camina);
    expect(a.paradas).toHaveLength(0);
    expect(a.nodos).toHaveLength(10);
    expect(a.km).toBeGreaterThan(1.0);
    expect(a.km).toBeLessThan(1.2);
  });

  it("parar menos de 5 minutos (un semáforo) no es una parada", () => {
    const a = analizarRecorrido([p(0, 0), p(1, 2), p(2, 3), p(3, 1), p(4, 200)]);
    expect(a.paradas).toHaveLength(0);
  });

  it("recorrido real: sale, para 20 min en un cliente, sigue", () => {
    const sale = [p(0, 0), p(1, 300), p(2, 600)];
    const cliente = Array.from({ length: 9 }, (_, i) => p(3 + i * 2.5, 900 + (i % 2) * 6, 4)); // 20 min
    const sigue = [p(26, 1300), p(27, 1700)];
    const a = analizarRecorrido([...sale, ...cliente, ...sigue]);
    expect(a.paradas).toHaveLength(1);
    expect(a.paradas[0].minutos).toBeGreaterThanOrEqual(19);
    // los puntos del cliente se juntaron en un solo nodo: 3 + 1 + 2
    expect(a.nodos).toHaveLength(6);
    expect(a.nodos.filter((n) => n.tipo === "parada")).toHaveLength(1);
  });

  it("una lectura mala (±150 m) no tuerce la línea: se descarta y se cuenta", () => {
    const a = analizarRecorrido([p(0, 0), p(1, 100), p(2, 5000, 5000, 150), p(3, 200)]);
    expect(a.descartados).toHaveLength(1);
    expect(a.descartados[0].precision).toBe(150);
    expect(a.nodos).toHaveLength(3);
    expect(a.km).toBeLessThan(0.3); // sin el salto de 7 km
  });

  it("si hay un hueco de más de 20 min sin datos, no se afirma que siguió en el mismo lugar", () => {
    const a = analizarRecorrido([p(0, 0), p(2, 1), p(4, 2), p(6, 1), p(40, 1), p(42, 2)]);
    // dos tramos quietos separados por el hueco: el primero (6 min) es parada, el segundo (2 min) no
    expect(a.paradas).toHaveLength(1);
    expect(a.paradas[0].hasta).toBe(T0 + 6 * MIN);
  });

  it("sin puntos o con uno solo no inventa nada", () => {
    expect(analizarRecorrido([])).toMatchObject({ nodos: [], paradas: [], km: 0, primero: null, ultimo: null });
    const uno = analizarRecorrido([p(0, 0)]);
    expect(uno.nodos).toHaveLength(1);
    expect(uno.primero).toEqual(uno.ultimo);
  });

  it("acepta los puntos desordenados y sin precisión declarada", () => {
    const a = analizarRecorrido([p(2, 200, 0, null), p(0, 0, 0, null), p(1, 100, 0, null)]);
    expect(a.nodos).toHaveLength(3);
    expect(a.primero!.t).toBe(T0);
    expect(a.ultimo!.t).toBe(T0 + 2 * MIN);
  });
});

describe("haceMinutos", () => {
  it("lo dice en palabras", () => {
    const ahora = T0 + 200 * MIN;
    expect(haceMinutos(ahora - 20_000, ahora)).toBe("hace menos de 1 min");
    expect(haceMinutos(ahora - 7 * MIN, ahora)).toBe("hace 7 min");
    expect(haceMinutos(ahora - 130 * MIN, ahora)).toBe("hace 2 h 10 min");
    expect(haceMinutos(ahora - 120 * MIN, ahora)).toBe("hace 2 h");
  });
});
