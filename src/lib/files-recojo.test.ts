import { describe, expect, it } from "vitest";
import { haceCuanto, horaLima, lineaDePasos, origenDelFile, recordarDesde } from "@/lib/files-recojo";

// Lima es UTC-5: las 13:26 de Lima son las 18:26 UTC.
const ahora = new Date("2026-09-30T18:26:00Z");

describe("haceCuanto", () => {
  it("minutos y horas del mismo día", () => {
    expect(haceCuanto("2026-09-30T18:06:00Z", ahora)).toBe("hace 20 min");
    expect(haceCuanto("2026-09-30T16:21:00Z", ahora)).toBe("hace 2 h 5 min");
    expect(haceCuanto("2026-09-30T16:26:00Z", ahora)).toBe("hace 2 h");
    expect(haceCuanto("2026-09-30T18:25:40Z", ahora)).toBe("hace un momento");
  });
  it("de otro día dice desde cuándo (el file durmió fuera)", () => {
    expect(haceCuanto("2026-09-29T21:40:00Z", ahora)).toBe("desde el 29/9 16:40");
  });
});

describe("recordarDesde", () => {
  it("antes de 30 minutos no se puede recordar", () => {
    expect(horaLima(recordarDesde("2026-09-30T18:10:00Z", ahora)!)).toBe("13:40");
  });
  it("pasados 30 minutos, o sin aviso previo, sí", () => {
    expect(recordarDesde("2026-09-30T17:56:00Z", ahora)).toBeNull();
    expect(recordarDesde(null, ahora)).toBeNull();
  });
});

describe("lineaDePasos", () => {
  it("el día solo se repite cuando cambia", () => {
    expect(
      lineaDePasos({
        solicitado_at: "2026-09-30T14:01:00Z",
        entregado_at: "2026-09-30T14:10:00Z",
        recibido_at: "2026-09-30T14:12:00Z",
        termine_at: "2026-09-30T16:40:00Z",
        devuelto_at: "2026-10-01T13:55:00Z",
        anulado_at: null,
      }),
    ).toBe("Pedido 30/9 09:01 · Entregado 09:10 · Recibido 09:12 · Terminé 11:40 · Devuelto 1/10 08:55");
  });
  it("un pedido anulado sin entregar", () => {
    expect(lineaDePasos({ solicitado_at: "2026-09-30T14:01:00Z", entregado_at: null, recibido_at: null, termine_at: null, devuelto_at: null, anulado_at: "2026-09-30T14:03:00Z" })).toBe(
      "Pedido 30/9 09:01 · Anulado 09:03",
    );
  });
});

// Entrega directa (0365, Carlos 01-10): Central lleva el file a postventa al
// generar el pedido, sin que nadie lo pida.
describe("entrega directa", () => {
  const base = { solicitado_at: "2026-10-01T16:05:00Z", entregado_at: "2026-10-01T16:05:00Z", recibido_at: "2026-10-01T16:07:00Z", termine_at: null, devuelto_at: null, anulado_at: null };
  it("dice de qué pedido salió y no inventa un «Pedido»", () => {
    expect(lineaDePasos({ ...base, entrega_directa: true, pedido_numero: "PED-0040-2026" })).toBe(
      "Entregado directo por Central al generar el pedido N° PED-0040-2026 1/10 11:05 · Recibido 11:07",
    );
  });
  it("sin pedido también se lee", () => {
    expect(origenDelFile({ entrega_directa: true, pedido_numero: null })).toBe("Entregado directo por Central, sin pedido");
  });
  it("un préstamo pedido no cambia", () => {
    expect(origenDelFile({ entrega_directa: false, pedido_numero: null })).toBeNull();
    expect(lineaDePasos(base)).toBe("Pedido 1/10 11:05 · Entregado 11:05 · Recibido 11:07");
  });
});
