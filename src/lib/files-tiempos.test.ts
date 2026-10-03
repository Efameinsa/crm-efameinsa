import { describe, expect, it } from "vitest";
import { duracionOficina, minutosDeOficina, tiemposDeFiles, type FilaTiempos } from "@/lib/files-tiempos";

// Horas de Lima escritas con su desfase (−05:00). El 02-10-2026 es viernes.
const L = (s: string) => `${s}:00-05:00`;

describe("minutosDeOficina", () => {
  it("dentro de la mañana cuenta corrido", () => {
    expect(minutosDeOficina(L("2026-10-02T09:00"), L("2026-10-02T09:25"))).toBe(25);
  });
  it("el almuerzo de 13 a 14 no cuenta", () => {
    expect(minutosDeOficina(L("2026-10-02T12:50"), L("2026-10-02T14:10"))).toBe(20);
  });
  it("pedido a las 17:50 entregado al día siguiente 8:05 = 15 min", () => {
    expect(minutosDeOficina(L("2026-10-01T17:50"), L("2026-10-02T08:05"))).toBe(15);
  });
  it("el sábado solo cuenta de 9 a 12 y el domingo nada", () => {
    // Viernes 17:00 → lunes 8:30: 60 (vie) + 180 (sáb) + 30 (lun).
    expect(minutosDeOficina(L("2026-10-02T17:00"), L("2026-10-05T08:30"))).toBe(270);
  });
  it("fuera de horario no suma y al revés da 0", () => {
    expect(minutosDeOficina(L("2026-10-02T19:00"), L("2026-10-02T22:00"))).toBe(0);
    expect(minutosDeOficina(L("2026-10-02T10:00"), L("2026-10-02T09:00"))).toBe(0);
  });
  it("un día hábil completo son 9 horas", () => {
    expect(minutosDeOficina(L("2026-10-01T00:00"), L("2026-10-02T00:00"))).toBe(540);
  });
});

describe("duracionOficina", () => {
  it("minutos, horas y días de oficina", () => {
    expect(duracionOficina(7)).toBe("7 min");
    expect(duracionOficina(125)).toBe("2 h 05 min");
    expect(duracionOficina(120)).toBe("2 h");
    expect(duracionOficina(540 + 180)).toBe("1 d 3 h");
  });
});

const base: FilaTiempos = {
  id: "x",
  solicitado_at: L("2026-10-01T09:00"),
  entregado_at: null,
  recibido_at: null,
  termine_at: null,
  devuelto_at: null,
  anulado_at: null,
  entrega_directa: false,
  cliente_texto: "ANCHOVETA SAC",
  solicitante: { nombre: "Rubí", codigo_comercial: "PV1" },
  entrego: null,
  recibio_vuelta: null,
};

describe("tiemposDeFiles", () => {
  const ahora = new Date(L("2026-10-02T10:00"));
  const filas: FilaTiempos[] = [
    { ...base, id: "a", entregado_at: L("2026-10-01T09:10"), recibido_at: L("2026-10-01T09:11"), termine_at: L("2026-10-01T11:00"), devuelto_at: L("2026-10-01T11:04"), entrego: { nombre: "Alondra" }, recibio_vuelta: { nombre: "Alondra" } },
    { ...base, id: "b", solicitado_at: L("2026-10-01T17:50"), entregado_at: L("2026-10-02T08:30"), entrego: { nombre: "Alondra" } },
    { ...base, id: "c", solicitado_at: L("2026-10-02T09:30") },
    { ...base, id: "d", entrega_directa: true, entregado_at: L("2026-10-01T09:00") },
    { ...base, id: "e", anulado_at: L("2026-10-01T09:05") },
  ];
  const t = tiemposDeFiles(filas, ahora);

  it("entregar: sin anulados ni entregas directas, en horario de oficina", () => {
    expect(t.entregar.n).toBe(2);
    expect(t.entregar.maximo).toBe(40); // 17:50→18:00 + 8:00→8:30
    expect(t.entregar.mediana).toBe(25);
    expect(t.entregar.porPersona).toEqual([{ nombre: "Alondra", n: 2, mediana: 25 }]);
    expect(t.entregar.esperando).toEqual([{ id: "c", cliente: "ANCHOVETA SAC", quien: "PV1 · Rubí", min: 30 }]);
  });
  it("recoger y fuera del archivador", () => {
    expect(t.recoger.n).toBe(1);
    expect(t.recoger.mediana).toBe(4);
    expect(t.fuera.n).toBe(1);
    // b y d siguen fuera.
    expect(t.fuera.esperando.map((e) => e.id).sort()).toEqual(["b", "d"]);
  });
  it("firmar «Recibí» pendiente", () => {
    expect(t.firmar.esperando.map((e) => e.id).sort()).toEqual(["b", "d"]);
  });
});
