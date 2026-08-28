import { describe, expect, it } from "vitest";
import { describirEquipo, huellaEquipo, ipsDeLaOficina, zonaDeAcceso, haceCuanto } from "./accesos";

// Los user-agent son los REALES de la tabla `accesos`: si mañana alguien entra
// desde un equipo que no sabemos leer, que falle acá y no en la pantalla de
// gerencia.
describe("describirEquipo", () => {
  it("lee la laptop de la oficina", () => {
    const e = describirEquipo(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    );
    expect(e.resumen).toBe("Windows · Chrome");
    expect(e.tipo).toBe("escritorio");
  });

  it("lee la Mac de la casa", () => {
    const e = describirEquipo(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Safari/605.1.15",
    );
    expect(e.resumen).toBe("Mac · Safari");
  });

  it("distingue el celular, que es la mitad del uso real", () => {
    expect(describirEquipo("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1").tipo).toBe("celular");
    expect(describirEquipo("Mozilla/5.0 (Linux; Android 14; SM-A546E) Chrome/126.0 Mobile Safari/537.36").sistema).toBe(
      "Android",
    );
  });

  it("no confunde Edge con Chrome ni el iPad con una Mac", () => {
    expect(describirEquipo("Windows NT 10.0; Chrome/120 Edg/120").navegador).toBe("Edge");
    expect(describirEquipo("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) Safari/604.1").sistema).toBe("iPad");
  });

  it("cuando no hay dato, lo dice", () => {
    expect(describirEquipo(null).resumen).toBe("Equipo sin identificar");
  });
});

describe("ipsDeLaOficina y zonaDeAcceso", () => {
  // La IP de la oficina se reconoce sola: es por la que entra media empresa.
  const accesos = [
    { ip: "181.66.9.86", user_id: "a" },
    { ip: "181.66.9.86", user_id: "b" },
    { ip: "181.66.9.86", user_id: "c" },
    { ip: "190.12.44.7", user_id: "a" },
    { ip: "190.12.44.7", user_id: "a" },
  ];

  it("reconoce la red compartida por la que entran tres o más personas", () => {
    const oficina = ipsDeLaOficina(accesos);
    expect(oficina.has("181.66.9.86")).toBe(true);
    expect(oficina.has("190.12.44.7")).toBe(false);
  });

  it("marca como fuera de la oficina la IP de una sola persona", () => {
    const oficina = ipsDeLaOficina(accesos);
    expect(zonaDeAcceso("181.66.9.86", oficina)).toEqual({ etiqueta: "Oficina", fuera: false });
    expect(zonaDeAcceso("190.12.44.7", oficina).fuera).toBe(true);
  });

  it("no alarma por la red interna ni por la falta de IP", () => {
    const oficina = new Set<string>();
    expect(zonaDeAcceso("192.168.1.40", oficina).fuera).toBe(false);
    expect(zonaDeAcceso(null, oficina).fuera).toBe(false);
  });
});

describe("huellaEquipo", () => {
  it("es la misma para dos entradas del mismo equipo y distinta si cambia la IP", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0) Chrome/151.0.0.0";
    expect(huellaEquipo(ua, "181.66.9.86")).toBe(huellaEquipo(ua, "181.66.9.86"));
    expect(huellaEquipo(ua, "181.66.9.86")).not.toBe(huellaEquipo(ua, "190.12.44.7"));
  });
});

describe("haceCuanto", () => {
  const ahora = new Date("2026-08-28T15:00:00Z").getTime();
  it("dice el tiempo como se dice en voz alta", () => {
    expect(haceCuanto("2026-08-28T14:58:00Z", ahora)).toBe("hace 2 min");
    expect(haceCuanto("2026-08-28T12:00:00Z", ahora)).toBe("hace 3 h");
    expect(haceCuanto("2026-08-27T15:00:00Z", ahora)).toBe("ayer");
    expect(haceCuanto("2026-08-24T15:00:00Z", ahora)).toBe("hace 4 días");
  });
});
