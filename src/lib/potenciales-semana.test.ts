import { describe, it, expect } from "vitest";
import { resumirSemana, type Potencial } from "@/lib/potenciales-semana";

/**
 * El cuadro de la semana lo dibujan tres sitios —«Mis potenciales», el pie de
 * la agenda y el PDF del reporte diario— y el sábado ese total es el que se
 * contrasta contra lo vendido. Si los tres no dan el mismo número, el cierre
 * semanal discute contra un número inventado.
 */

const LUNES = "2026-08-24"; // lunes; el sábado de esa semana es el 29

function potencial(p: Partial<Potencial>): Potencial {
  return {
    id: crypto.randomUUID(),
    cliente: "Cliente",
    rubro: null,
    comercialId: "c1",
    comercialCodigo: "C1",
    comercialNombre: "Comercial",
    etapa: "potencial",
    cierreProyectado: null,
    presupuesto: null,
    monto: null,
    moneda: "USD",
    montoUsd: null,
    items: [],
    ...p,
  };
}

describe("resumirSemana", () => {
  it("reparte por día y suma el total de la semana", () => {
    const r = resumirSemana(LUNES, [
      potencial({ cliente: "A", cierreProyectado: "2026-08-24", montoUsd: 10_000 }),
      potencial({ cliente: "B", cierreProyectado: "2026-08-24", montoUsd: 20_000 }),
      potencial({ cliente: "C", cierreProyectado: "2026-08-25", montoUsd: 30_000 }),
    ]);

    expect(r.dias).toHaveLength(6); // lunes a sábado: acá se trabaja el sábado
    expect(r.dias[0].total).toBe(30_000);
    expect(r.dias[1].total).toBe(30_000);
    expect(r.totalSemana).toBe(60_000);
  });

  it("ordena los clientes del día de mayor a menor", () => {
    const r = resumirSemana(LUNES, [
      potencial({ cliente: "chico", cierreProyectado: "2026-08-24", montoUsd: 1_000 }),
      potencial({ cliente: "grande", cierreProyectado: "2026-08-24", montoUsd: 90_000 }),
    ]);
    expect(r.dias[0].clientes.map((c) => c.cliente)).toEqual(["grande", "chico"]);
  });

  it("deja en «por ubicar» lo que está en negociación sin fecha, y NO lo suma al proyectado", () => {
    const r = resumirSemana(LUNES, [
      potencial({ cliente: "con fecha", cierreProyectado: "2026-08-26", montoUsd: 5_000 }),
      potencial({ cliente: "sin fecha", cierreProyectado: null, montoUsd: 80_000 }),
    ]);

    expect(r.totalSemana).toBe(5_000);
    expect(r.porUbicar.map((c) => c.cliente)).toEqual(["sin fecha"]);
    expect(r.totalPorUbicar).toBe(80_000);
  });

  it("ignora lo de otras semanas y lo que no está en negociación sin fecha", () => {
    const r = resumirSemana(LUNES, [
      potencial({ cliente: "semana pasada", cierreProyectado: "2026-08-20", montoUsd: 7_000 }),
      potencial({ cliente: "domingo", cierreProyectado: "2026-08-30", montoUsd: 7_000 }),
      potencial({ cliente: "cotizada sin fecha", etapa: "cotizada", cierreProyectado: null, montoUsd: 7_000 }),
    ]);

    expect(r.totalSemana).toBe(0);
    expect(r.porUbicar).toHaveLength(0);
  });

  it("un potencial sin monto cuenta como cliente pero suma cero", () => {
    const r = resumirSemana(LUNES, [
      potencial({ cliente: "sin monto", cierreProyectado: "2026-08-24", montoUsd: null }),
    ]);
    expect(r.dias[0].clientes).toHaveLength(1);
    expect(r.totalSemana).toBe(0);
  });
});
