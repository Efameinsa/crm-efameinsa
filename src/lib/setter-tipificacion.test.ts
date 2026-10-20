import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/notificaciones", () => ({ notificarLeadEntrante: vi.fn() }));
vi.mock("@/lib/meta-formularios", () => ({ repartirFormularioMeta: vi.fn() }));

import { RESULTADOS, esResultado, proximoIntento } from "./setter-tipificacion";

// Lima = UTC-5. 15:00 en Lima es 20:00 UTC.
const lima = (h: number, m = 0, dia = 20) => new Date(Date.UTC(2026, 9, dia, h + 5, m));
const horaLima = (d: Date) => new Date(d.getTime() - 5 * 3_600_000).getUTCHours();

describe("tipificación del setter", () => {
  it("cada resultado pasa, cierra o reintenta, y los que cierran traen motivo del catálogo", () => {
    for (const [clave, def] of Object.entries(RESULTADOS)) {
      expect(esResultado(clave)).toBe(true);
      if (def.tipo === "cierra") expect(def.motivo).toBeTypeOf("number");
      if (def.tipo === "pasa") expect(def.intencion).toBeTruthy();
    }
    expect(RESULTADOS.domestico.motivo).toBe(2525);
    expect(esResultado("inventado")).toBe(false);
    expect(esResultado("toString")).toBe(false);
  });

  it("el segundo intento sale 2 horas después si cae en horario de oficina", () => {
    const d = proximoIntento(lima(10), 2);
    expect(d.getTime()).toBe(lima(12).getTime());
  });

  it("si el reintento cae de noche, se mueve a las 9:00 del día siguiente", () => {
    const d = proximoIntento(lima(18), 2); // 20:00
    expect(horaLima(d)).toBe(9);
    expect(d.getTime()).toBe(lima(9, 0, 21).getTime());
  });

  it("si cae de madrugada, sale a las 9:00 de ese mismo día", () => {
    const d = proximoIntento(lima(23), 5); // 04:00 del día siguiente
    expect(d.getTime()).toBe(lima(9, 0, 21).getTime());
  });
});
