import { describe, expect, it } from "vitest";
import { estimarSaldo, type MovimientoSaldo } from "./saldo-ads";

const m = (id: string, tipo: MovimientoSaldo["tipo"], monto: number, fecha: string): MovimientoSaldo => ({ id, tipo, monto, fecha });

describe("estimarSaldo", () => {
  it("sin movimientos no estima ni alerta", () => {
    const e = estimarSaldo([], 250);
    expect(e.sinDatos).toBe(true);
    expect(e.menosDeUnDia).toBe(false);
  });

  it("descuenta el tope diario desde la recarga", () => {
    const e = estimarSaldo([m("a", "recarga", 1000, "2026-10-09T12:00:00Z")], 250, new Date("2026-10-11T12:00:00Z"));
    expect(e.saldo).toBe(500);
    expect(e.diasRestantes).toBe(2);
    expect(e.menosDeUnDia).toBe(false);
    expect(e.agotamientoAt).toBe("2026-10-13T12:00:00.000Z");
  });

  it("avisa cuando queda menos de un día", () => {
    const e = estimarSaldo([m("a", "recarga", 1000, "2026-10-09T12:00:00Z")], 250, new Date("2026-10-12T18:00:00Z"));
    expect(e.saldo).toBe(187.5);
    expect(e.menosDeUnDia).toBe(true);
    expect(e.ultimoMovimientoId).toBe("a");
  });

  it("no baja de cero y la recarga posterior suma sobre cero", () => {
    const e = estimarSaldo(
      [m("a", "recarga", 250, "2026-10-01T00:00:00Z"), m("b", "recarga", 500, "2026-10-05T00:00:00Z")],
      250,
      new Date("2026-10-05T00:00:00Z"),
    );
    expect(e.saldo).toBe(500);
    expect(e.ultimoMovimientoId).toBe("b");
  });

  it("la corrección según Google reemplaza el saldo estimado", () => {
    const e = estimarSaldo(
      [m("a", "recarga", 1000, "2026-10-09T00:00:00Z"), m("b", "calibracion", 900, "2026-10-10T00:00:00Z")],
      250,
      new Date("2026-10-10T12:00:00Z"),
    );
    expect(e.saldo).toBe(775);
    expect(e.ultimoMovimientoId).toBe("b");
  });
});
