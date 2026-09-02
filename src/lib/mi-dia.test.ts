import { describe, expect, it } from "vitest";
import { diasEntre, vencioHace } from "./mi-dia";

describe("vencioHace", () => {
  const hoy = "2026-09-02";

  it("cuenta días de calendario, no de 24 horas", () => {
    expect(diasEntre("2026-09-01", hoy)).toBe(1);
    expect(diasEntre("2026-08-02", hoy)).toBe(31);
  });

  it("lo dice en palabras según la distancia", () => {
    expect(vencioHace("2026-09-02", hoy)).toBe("vence hoy");
    expect(vencioHace("2026-09-01", hoy)).toBe("venció ayer");
    expect(vencioHace("2026-08-27", hoy)).toBe("venció hace 6 días");
    expect(vencioHace("2026-06-02", hoy)).toBe("venció hace 3 meses");
    expect(vencioHace("2025-03-15", hoy)).toBe("venció hace más de un año");
    expect(vencioHace("2021-01-10", hoy)).toBe("venció hace 5 años");
  });
});
