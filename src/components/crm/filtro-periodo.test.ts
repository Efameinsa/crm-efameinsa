import { describe, expect, it } from "vitest";
import { desplazarRango, escalaDelRango, rangoDeEscala, rotuloDeEscala } from "./filtro-periodo";

// 2026-09-01 es martes; el lunes de esa semana es el 31-08.
const HOY = "2026-09-01";

describe("rangoDeEscala (día / semana / mes / año que contienen una fecha)", () => {
  it("día: el mismo día de punta a punta", () => {
    expect(rangoDeEscala("dia", HOY)).toEqual({ desde: HOY, hasta: HOY });
  });

  it("semana: de lunes a domingo, aunque la fecha cruce de mes", () => {
    expect(rangoDeEscala("semana", HOY)).toEqual({ desde: "2026-08-31", hasta: "2026-09-06" });
  });

  it("mes: del 1 al último día, también en febrero", () => {
    expect(rangoDeEscala("mes", "2026-08-19")).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" });
    expect(rangoDeEscala("mes", "2028-02-10")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });

  it("año: del 1 de enero al 31 de diciembre", () => {
    expect(rangoDeEscala("anio", HOY)).toEqual({ desde: "2026-01-01", hasta: "2026-12-31" });
  });
});

describe("escalaDelRango (qué escala tiene un rango de la URL)", () => {
  it("reconoce el período completo", () => {
    expect(escalaDelRango("2026-08-24", "2026-08-30", HOY)).toBe("semana");
    expect(escalaDelRango("2026-07-01", "2026-07-31", HOY)).toBe("mes");
    expect(escalaDelRango("2025-01-01", "2025-12-31", HOY)).toBe("anio");
  });

  it("reconoce el período en curso que corta en hoy, como lo dejan los presets", () => {
    expect(escalaDelRango("2026-08-31", HOY, HOY)).toBe("semana");
    expect(escalaDelRango("2026-09-01", HOY, HOY)).toBe("dia"); // el día 1: un solo día gana
    expect(escalaDelRango("2026-01-01", HOY, HOY)).toBe("anio");
  });

  it("un rango a mano no es ninguna escala", () => {
    expect(escalaDelRango("2026-08-03", "2026-08-20", HOY)).toBeNull();
    expect(escalaDelRango("2026-08-01", "2026-08-15", HOY)).toBeNull(); // empieza el 1 pero no es el mes
  });
});

describe("desplazarRango (anterior / siguiente)", () => {
  it("semana anterior desde la semana en curso: lunes a domingo completos", () => {
    expect(desplazarRango("semana", "2026-08-31", -1, HOY)).toEqual({ desde: "2026-08-24", hasta: "2026-08-30" });
  });

  it("semana siguiente desde la anterior vuelve a la actual, cortada en hoy", () => {
    expect(desplazarRango("semana", "2026-08-24", 1, HOY)).toEqual({ desde: "2026-08-31", hasta: HOY });
  });

  it("mes anterior cruza el año", () => {
    expect(desplazarRango("mes", "2026-01-01", -1, HOY)).toEqual({ desde: "2025-12-01", hasta: "2025-12-31" });
  });

  it("año anterior y año siguiente (en curso corta en hoy)", () => {
    expect(desplazarRango("anio", "2026-01-01", -1, HOY)).toEqual({ desde: "2025-01-01", hasta: "2025-12-31" });
    expect(desplazarRango("anio", "2025-01-01", 1, HOY)).toEqual({ desde: "2026-01-01", hasta: HOY });
  });

  it("día siguiente a hoy queda en el futuro (la pantalla lo deshabilita)", () => {
    expect(desplazarRango("dia", HOY, 1, HOY)).toEqual({ desde: "2026-09-02", hasta: "2026-09-02" });
  });
});

describe("rotuloDeEscala", () => {
  it("dice el período en palabras", () => {
    expect(rotuloDeEscala("dia", HOY)).toBe("1 de septiembre de 2026");
    expect(rotuloDeEscala("semana", HOY)).toBe("Semana del 31 de agosto al 6 de septiembre de 2026");
    expect(rotuloDeEscala("mes", "2026-08-01")).toBe("agosto 2026");
    expect(rotuloDeEscala("anio", "2026-01-01")).toBe("2026");
  });
});
