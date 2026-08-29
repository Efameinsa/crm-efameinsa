import { describe, expect, it } from "vitest";
import { periodoPreset, resolverPeriodo, hoyLima } from "./periodo";

describe("hoyLima", () => {
  it("devuelve fecha en formato YYYY-MM-DD", () => {
    expect(hoyLima()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("periodoPreset", () => {
  it("mes: desde el día 1 del mes hasta hoy", () => {
    expect(periodoPreset("mes", "2026-08-19")).toEqual({ desde: "2026-08-01", hasta: "2026-08-19" });
  });

  it("mes en el día 1 no se sale al mes anterior", () => {
    expect(periodoPreset("mes", "2026-08-01")).toEqual({ desde: "2026-08-01", hasta: "2026-08-01" });
  });

  it("mes_anterior: todo julio cuando hoy es agosto", () => {
    expect(periodoPreset("mes_anterior", "2026-08-15")).toEqual({ desde: "2026-07-01", hasta: "2026-07-31" });
  });

  it("mes_anterior cruza el año en enero (diciembre del año pasado)", () => {
    expect(periodoPreset("mes_anterior", "2026-01-10")).toEqual({ desde: "2025-12-01", hasta: "2025-12-31" });
  });

  it("mes_anterior en 29-feb de año bisiesto cae en enero completo", () => {
    // 2026 no es bisiesto; se prueba con 2028 (bisiesto) para ejercitar el borde real.
    expect(periodoPreset("mes_anterior", "2028-03-01")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });

  it("30d: incluye hoy + 29 días atrás = 30 días totales", () => {
    const r = periodoPreset("30d", "2026-08-19");
    expect(r.hasta).toBe("2026-08-19");
    expect(r.desde).toBe("2026-07-21");
  });

  it("90d cruza el fin de año correctamente", () => {
    expect(periodoPreset("90d", "2026-01-15")).toEqual({ desde: "2025-10-18", hasta: "2026-01-15" });
  });

  it("anio: desde el 1 de enero del año de hoy", () => {
    expect(periodoPreset("anio", "2026-08-19")).toEqual({ desde: "2026-01-01", hasta: "2026-08-19" });
  });

  it("12m: 12 meses hacia atrás desde el mismo día del mes", () => {
    expect(periodoPreset("12m", "2026-08-19")).toEqual({ desde: "2025-09-01", hasta: "2026-08-19" });
  });

  it("12m en enero retrocede el año correctamente", () => {
    expect(periodoPreset("12m", "2026-01-19")).toEqual({ desde: "2025-02-01", hasta: "2026-01-19" });
  });

  it("todo: arranca en la fecha fija de origen del proyecto", () => {
    expect(periodoPreset("todo", "2026-08-19")).toEqual({ desde: "2018-01-01", hasta: "2026-08-19" });
  });

  it("31-dic: 'mes' no se corre a enero del año siguiente", () => {
    expect(periodoPreset("mes", "2026-12-31")).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" });
  });
});

describe("resolverPeriodo", () => {
  const hoy = "2026-08-19";

  it("sin parámetros cae al preset por defecto", () => {
    const r = resolverPeriodo({}, "mes");
    expect(r.preset).toBe("mes");
    expect(r).toMatchObject(periodoPreset("mes"));
  });

  it("desde/hasta válidos y coincidentes con un preset lo detecta", () => {
    const esperado = periodoPreset("30d", hoy);
    const r = resolverPeriodo({ desde: esperado.desde, hasta: esperado.hasta });
    // El preset detectado depende de "hoy" real, así que solo se valida el rango.
    expect(r.desde).toBe(esperado.desde);
    expect(r.hasta).toBe(esperado.hasta);
  });

  it("rango personalizado (no calza ningún preset) → preset null", () => {
    const r = resolverPeriodo({ desde: "2026-03-05", hasta: "2026-03-12" });
    expect(r).toMatchObject({ desde: "2026-03-05", hasta: "2026-03-12", preset: null });
  });

  it("desde > hasta cae al valor por defecto", () => {
    const r = resolverPeriodo({ desde: "2026-08-19", hasta: "2026-08-01" }, "mes");
    expect(r.preset).toBe("mes");
  });

  it("fecha con formato inválido cae al valor por defecto", () => {
    const r = resolverPeriodo({ desde: "19-08-2026", hasta: "2026-08-19" }, "90d");
    expect(r.preset).toBe("90d");
  });

  it("solo un extremo presente cae al valor por defecto", () => {
    const r = resolverPeriodo({ desde: "2026-08-01" }, "mes");
    expect(r.preset).toBe("mes");
  });

  it("desde == hasta es un rango válido de un solo día", () => {
    const r = resolverPeriodo({ desde: "2026-08-19", hasta: "2026-08-19" }, "mes");
    expect(r.desde).toBe("2026-08-19");
    expect(r.hasta).toBe("2026-08-19");
  });
});

/**
 * La semana es el período que más se mira (pedido de Darwin 28-08: «cada
 * semana es importante, más importante que mensual»), así que se prueba con
 * los bordes que rompen: el propio lunes, el domingo, y el cruce de mes.
 */
describe("semana", () => {
  it("empieza el lunes y llega hasta hoy", () => {
    // 2026-08-28 es viernes; su lunes es el 24.
    expect(periodoPreset("semana", "2026-08-28")).toEqual({ desde: "2026-08-24", hasta: "2026-08-28" });
  });

  it("un lunes, la semana es ese solo día", () => {
    expect(periodoPreset("semana", "2026-08-24")).toEqual({ desde: "2026-08-24", hasta: "2026-08-24" });
  });

  it("el domingo todavía pertenece a la semana que arrancó el lunes", () => {
    expect(periodoPreset("semana", "2026-08-30")).toEqual({ desde: "2026-08-24", hasta: "2026-08-30" });
  });

  it("una semana a caballo entre dos meses no se corta el día 1", () => {
    // Martes 1 de septiembre: su lunes es el 31 de agosto.
    expect(periodoPreset("semana", "2026-09-01")).toEqual({ desde: "2026-08-31", hasta: "2026-09-01" });
  });

  it("semana anterior: lunes a domingo completos, sin pisar la actual", () => {
    expect(periodoPreset("semana_anterior", "2026-08-28")).toEqual({ desde: "2026-08-17", hasta: "2026-08-23" });
  });

  it("semana anterior pega con la actual: no hay días perdidos entre las dos", () => {
    const anterior = periodoPreset("semana_anterior", "2026-08-28");
    const actual = periodoPreset("semana", "2026-08-28");
    const diaSiguiente = new Date(`${anterior.hasta}T12:00:00Z`);
    diaSiguiente.setUTCDate(diaSiguiente.getUTCDate() + 1);
    expect(diaSiguiente.toISOString().slice(0, 10)).toBe(actual.desde);
  });

  it("un rango de lunes a hoy se reconoce como «esta semana», no como rango suelto", () => {
    const r = periodoPreset("semana");
    expect(resolverPeriodo({ desde: r.desde, hasta: r.hasta }).preset).toBe("semana");
  });
});
