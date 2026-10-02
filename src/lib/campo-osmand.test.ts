import { describe, expect, test } from "vitest";
import { FORMA_TOKEN, LimiteDeTasa, generarToken, leerHora, leerJson, leerParametros, sinRepetidos } from "@/lib/campo-osmand";

// GPS del celular para el piloto de campo (0367; Carlos vía Santos, 01-10-2026).
const AHORA = new Date("2026-10-02T15:00:00Z").getTime();
const TOKEN = "k7pxm-3hq9r-abcde-23456";

describe("formato clásico (Traccar Client ≤ v8 / OsmAnd)", () => {
  test("lee id, coordenadas, hora en segundos, nudos → m/s, batería", () => {
    const p = new URLSearchParams({
      id: TOKEN,
      lat: "-12.046374",
      lon: "-77.042793",
      timestamp: String(Math.floor(AHORA / 1000) - 60),
      accuracy: "6.5",
      speed: "10",
      bearing: "182.4",
      altitude: "150",
      batt: "87",
    });
    const e = leerParametros(p, AHORA);
    expect(e.token).toBe(TOKEN);
    expect(e.descartadas).toBe(0);
    expect(e.posiciones).toHaveLength(1);
    const [x] = e.posiciones;
    expect(x.lat).toBeCloseTo(-12.046374);
    expect(x.lon).toBeCloseTo(-77.042793);
    expect(x.precision_m).toBe(6.5);
    expect(x.velocidad_mps).toBeCloseTo(5.14444);
    expect(x.rumbo).toBeCloseTo(182.4);
    expect(x.bateria).toBe(87);
    expect(x.registrada_at).toBe(new Date(AHORA - 60_000).toISOString());
  });

  test("deviceid, location=lat,lon y hora en milisegundos o ISO", () => {
    const ms = leerParametros(new URLSearchParams({ deviceid: TOKEN, location: "-12.1,-77.0", timestamp: String(AHORA - 5000) }), AHORA);
    expect(ms.token).toBe(TOKEN);
    expect(ms.posiciones[0].lat).toBeCloseTo(-12.1);
    expect(ms.posiciones[0].registrada_at).toBe(new Date(AHORA - 5000).toISOString());
    expect(leerHora("2026-10-02T14:59:00Z")).toBe(AHORA - 60_000);
  });

  test("sin hora: vale la de llegada; -1 en precisión y velocidad es «sin dato»", () => {
    const e = leerParametros(new URLSearchParams({ id: TOKEN, lat: "-12", lon: "-77", accuracy: "-1", speed: "-1" }), AHORA);
    expect(e.posiciones[0].registrada_at).toBe(new Date(AHORA).toISOString());
    expect(e.posiciones[0].precision_m).toBeNull();
    expect(e.posiciones[0].velocidad_mps).toBeNull();
  });

  test("descarta coordenadas imposibles, 0,0 y horas del futuro o de hace semanas", () => {
    const malas: Record<string, string>[] = [
      { lat: "95", lon: "-77" },
      { lat: "-12", lon: "200" },
      { lat: "0", lon: "0" },
      { lat: "abc", lon: "-77" },
      { lat: "-12", lon: "-77", timestamp: String(Math.floor(AHORA / 1000) + 3600) },
      { lat: "-12", lon: "-77", timestamp: String(Math.floor(AHORA / 1000) - 8 * 86400) },
    ];
    for (const m of malas) {
      const e = leerParametros(new URLSearchParams({ id: TOKEN, ...m }), AHORA);
      expect(e.posiciones, JSON.stringify(m)).toHaveLength(0);
      expect(e.descartadas).toBe(1);
      expect(e.token).toBe(TOKEN);
    }
  });
});

describe("formato JSON (Traccar Client v9+)", () => {
  const ubicacion = (extra: Record<string, unknown> = {}) => ({
    timestamp: "2026-10-02T14:58:30.000Z",
    coords: { latitude: -12.0912, longitude: -77.0282, accuracy: 4.2, speed: 8.3, heading: 90, altitude: 120 },
    is_moving: true,
    activity: { type: "in_vehicle" },
    battery: { level: 0.64, is_charging: false },
    ...extra,
  });

  test("lee device_id, coords (m/s), batería 0-1 → %, movimiento", () => {
    const e = leerJson({ device_id: TOKEN, location: ubicacion() }, AHORA);
    expect(e.token).toBe(TOKEN);
    const [x] = e.posiciones;
    expect(x.lat).toBeCloseTo(-12.0912);
    expect(x.velocidad_mps).toBeCloseTo(8.3);
    expect(x.rumbo).toBe(90);
    expect(x.precision_m).toBe(4.2);
    expect(x.bateria).toBe(64);
    expect(x.registrada_at).toBe("2026-10-02T14:58:30.000Z");
    expect(x.detalle).toBe("en movimiento · en vehículo");
  });

  test("una ubicación simulada (GPS falso) queda marcada", () => {
    const e = leerJson({ device_id: TOKEN, location: ubicacion({ mock: true }) }, AHORA);
    expect(e.posiciones[0].detalle).toContain("UBICACIÓN SIMULADA");
  });

  test("lote: location como lista; las malas se cuentan aparte", () => {
    const e = leerJson(
      {
        device_id: TOKEN,
        location: [ubicacion(), ubicacion({ timestamp: "2026-10-02T14:59:30.000Z" }), { coords: { latitude: 300, longitude: 0 } }],
      },
      AHORA,
    );
    expect(e.posiciones).toHaveLength(2);
    expect(e.descartadas).toBe(1);
  });

  test("batería -1 y velocidad -1 (sin dato) quedan en null", () => {
    const e = leerJson(
      { device_id: TOKEN, location: ubicacion({ battery: { level: -1 }, coords: { latitude: -12, longitude: -77, speed: -1, heading: -1 } }) },
      AHORA,
    );
    expect(e.posiciones[0].bateria).toBeNull();
    expect(e.posiciones[0].velocidad_mps).toBeNull();
    expect(e.posiciones[0].rumbo).toBeNull();
  });

  test("cuerpo vacío o sin location: sin token ni posiciones", () => {
    expect(leerJson(null, AHORA)).toEqual({ token: null, posiciones: [], descartadas: 0 });
    expect(leerJson({ device_id: TOKEN }, AHORA).posiciones).toHaveLength(0);
  });
});

describe("duplicados, token y límite", () => {
  test("la misma hora del GPS dentro de un lote entra una vez", () => {
    const e = leerJson(
      {
        device_id: TOKEN,
        location: [1, 2, 3].map(() => ({ timestamp: "2026-10-02T14:58:30.000Z", coords: { latitude: -12, longitude: -77 } })),
      },
      AHORA,
    );
    expect(sinRepetidos(e.posiciones)).toHaveLength(1);
  });

  test("el token se puede tipear: 4 grupos de 5, sin 0/o/1/l", () => {
    for (let i = 0; i < 50; i++) {
      const t = generarToken();
      expect(t).toMatch(FORMA_TOKEN);
      expect(t).not.toMatch(/[01lo]/);
    }
    expect(new Set(Array.from({ length: 200 }, () => generarToken())).size).toBe(200);
    expect(FORMA_TOKEN.test("123")).toBe(false);
  });

  test("límite de tasa por ventana", () => {
    const l = new LimiteDeTasa(3, 60_000);
    expect([1, 2, 3, 4].map(() => l.permitir("a", 1000))).toEqual([true, true, true, false]);
    expect(l.permitir("b", 1000)).toBe(true);
    expect(l.permitir("a", 61_000)).toBe(true);
  });
});
