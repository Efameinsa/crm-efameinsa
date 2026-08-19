import { describe, expect, it } from "vitest";
import { coincide, normalizar } from "./selector-hora";

describe("normalizar (SelectorHora: texto tipeado → HH:MM)", () => {
  it("solo la hora → :00", () => {
    expect(normalizar("9")).toBe("09:00");
    expect(normalizar("14")).toBe("14:00");
  });

  it("hora:minuto ya formateado", () => {
    expect(normalizar("14:45")).toBe("14:45");
    expect(normalizar("9:05")).toBe("09:05");
  });

  it("dígitos pegados (935 → 09:35, 1445 → 14:45)", () => {
    expect(normalizar("935")).toBe("09:35");
    expect(normalizar("1445")).toBe("14:45");
  });

  it("hora u minuto fuera de rango → null", () => {
    expect(normalizar("25:00")).toBeNull();
    expect(normalizar("2599")).toBeNull();
  });

  it("texto no numérico → null", () => {
    expect(normalizar("catorce")).toBeNull();
  });

  it("espacios alrededor no rompen el parseo", () => {
    expect(normalizar("  14:30  ")).toBe("14:30");
  });
});

describe("coincide (filtro de la lista de medias horas)", () => {
  it("query vacía coincide con todo", () => {
    expect(coincide("14:00", "")).toBe(true);
  });

  it("filtra por el inicio de la hora", () => {
    expect(coincide("14:00", "14")).toBe(true);
    expect(coincide("14:30", "14")).toBe(true);
    expect(coincide("15:00", "14")).toBe(false);
  });

  it("también coincide sin el cero inicial ('9' encuentra 09:00)", () => {
    expect(coincide("09:00", "9")).toBe(true);
  });

  it("coincide con hora y minuto exactos escritos con separador", () => {
    expect(coincide("14:30", "14:3")).toBe(true);
    expect(coincide("14:00", "14:3")).toBe(false);
  });
});
