import { describe, it, expect } from "vitest";
import { antecedentesInternaVacios, filasAntecedentesInterna, normalizarAntecedentesInterna, type AntecedentesInterna } from "./apertura-interna";

/**
 * La apertura de servicio INTERNO con lo que pidió Brenda el 23-10: fecha de
 * compra, puesta en marcha, primer mantenimiento, mantenimiento correctivo,
 * repuesto vendido, el problema por el que viene a planta y qué servicio se le
 * hace (preventivo, correctivo o revisión).
 */
describe("apertura interna: antecedentes (Brenda 23-10)", () => {
  const base = (): AntecedentesInterna => ({
    ...antecedentesInternaVacios(),
    servicio: "correctivo",
    que_ejecutar: "No calienta: revisar quemador",
    fecha_compra: "2024-03-01",
    fecha_puesta_marcha: "2024-03-15",
    fecha_primer_mantenimiento: "2024-09-10",
    fecha_mantenimiento_correctivo: "2025-06-02",
  });

  it("exige el problema y el servicio en planta", () => {
    expect(normalizarAntecedentesInterna({ ...base(), que_ejecutar: "  " })).toMatch(/problema/i);
    expect(normalizarAntecedentesInterna({ ...base(), servicio: "" })).toMatch(/preventivo, correctivo o revisión/);
    expect(normalizarAntecedentesInterna({ ...base(), servicio: undefined })).toMatch(/preventivo, correctivo o revisión/);
  });

  it("valida cada fecha y conserva las buenas", () => {
    expect(normalizarAntecedentesInterna({ ...base(), fecha_puesta_marcha: "15/03/2024" })).toBe("La fecha de puesta en marcha no es válida");
    expect(normalizarAntecedentesInterna({ ...base(), fecha_primer_mantenimiento: "x" })).toBe("La fecha del primer mantenimiento no es válida");
    expect(normalizarAntecedentesInterna({ ...base(), fecha_mantenimiento_correctivo: "2025-6-2" })).toBe("La fecha del mantenimiento correctivo no es válida");
    const n = normalizarAntecedentesInterna(base());
    expect(typeof n).toBe("object");
    const a = n as AntecedentesInterna;
    expect(a.servicio).toBe("correctivo");
    expect(a.fecha_puesta_marcha).toBe("2024-03-15");
    expect(a.fecha_primer_mantenimiento).toBe("2024-09-10");
    expect(a.fecha_mantenimiento_correctivo).toBe("2025-06-02");
    // Vacías quedan en null, no en "".
    expect((normalizarAntecedentesInterna({ ...base(), fecha_puesta_marcha: "" }) as AntecedentesInterna).fecha_puesta_marcha).toBeNull();
  });

  it("la hoja muestra las fechas en día/mes/año y el servicio marcado", () => {
    const filas = Object.fromEntries(filasAntecedentesInterna(base()));
    expect(filas["Servicio en planta"]).toBe("Mantenimiento correctivo");
    expect(filas["Problema: por qué viene a planta y qué se ejecuta"]).toBe("No calienta: revisar quemador");
    expect(filas["Fecha de puesta en marcha"]).toBe("15/03/2024");
    expect(filas["Fecha del primer mantenimiento"]).toBe("10/09/2024");
    expect(filas["Fecha del último mantenimiento correctivo"]).toBe("02/06/2025");
  });

  it("las aperturas de antes del 23-10 (sin esos campos) salen con «Sin dato» y no rompen", () => {
    const vieja = { ...antecedentesInternaVacios(), que_ejecutar: "Revisar" } as AntecedentesInterna;
    delete (vieja as Partial<AntecedentesInterna>).servicio;
    delete (vieja as Partial<AntecedentesInterna>).fecha_puesta_marcha;
    delete (vieja as Partial<AntecedentesInterna>).fecha_primer_mantenimiento;
    delete (vieja as Partial<AntecedentesInterna>).fecha_mantenimiento_correctivo;
    const filas = Object.fromEntries(filasAntecedentesInterna(vieja));
    expect(filas["Servicio en planta"]).toBe("Sin dato");
    expect(filas["Fecha de puesta en marcha"]).toBe("Sin dato");
    expect(filas["Fecha del último mantenimiento correctivo"]).toBe("Sin dato");
  });
});
